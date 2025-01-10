// src/crawler/crawler.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../models/article.entity';
import { ConfigService } from '@nestjs/config';
// import { Worker } from 'worker_threads';
import * as path from 'path';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Category } from '../models/category.entity';
import { ArticlesPaginationResult } from './type';
import { LoggingService } from '../logging/logging.service';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as xml2js from 'xml2js';
import axios, { AxiosInstance } from 'axios';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';

@Injectable()
export class WebCrawlerService implements OnModuleInit {
  private readonly BASE_URL = 'https://vnexpress.net/';
  private isRunning = false;
  private readonly maxRetries = 3;
  private readonly retryDelay = 5000;
  private readonly axiosInstance: AxiosInstance;

  private readonly articleTypes = {
    0: 'thoi-su',
    1: 'du-lich',
    2: 'the-gioi',
    3: 'kinh-doanh',
    4: 'khoa-hoc',
    5: 'giai-tri',
    6: 'the-thao',
    7: 'phap-luat',
    8: 'giao-duc',
    9: 'suc-khoe',
    10: 'doi-song',
  };

  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectQueue('crawler') private readonly crawlerQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
    private readonly elasticsearchService: ElasticsearchService,
  ) {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
      maxRedirects: 5,
    });
  }

  onModuleInit() {
    // Uncomment to start crawling on init
    this.startCrawling();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledCrawling() {
    this.logger.log('Starting scheduled crawl...');
    await this.startCrawling();
  }

  async startCrawling() {
    if (this.isRunning) {
      this.logger.warn('Crawler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting crawler...');

    try {
      const timer = this.metricsService.startCrawlTimer('vnexpress');

      for (const [, articleType] of Object.entries(this.articleTypes)) {
        let retries = 0;
        while (retries < this.maxRetries) {
          try {
            await this.queueCrawlJob(articleType);
            break;
          } catch (error) {
            retries++;
            this.logger.error(
              `Error queuing job for ${articleType} (attempt ${retries}/${this.maxRetries})`,
              error.stack,
            );
            if (retries < this.maxRetries) {
              await this.delay(this.retryDelay * retries);
            }
          }
        }
      }

      timer();
      this.logger.log('Crawl completed successfully');
    } catch (error) {
      this.logger.error('Error during crawling', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  private async queueCrawlJob(articleType: string) {
    try {
      const job = await this.crawlerQueue.add(
        'crawl',
        {
          articleType,
          BASE_URL: this.BASE_URL,
          mode: 'crawl',
        },
        {
          attempts: this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: this.retryDelay,
          },
          removeOnComplete: true,
          timeout: 300000, // 5 minutes timeout
        },
      );

      this.logger.log(`Queued job ${job.id} for ${articleType}`);
      return job;
    } catch (error) {
      this.logger.error(
        `Error queuing crawl job for ${articleType}`,
        error.stack,
      );
      throw error;
    }
  }

  async saveArticle(articleData: Partial<Article>) {
    const cacheKey = this.redisService.generateKey(
      'vnexpress-article',
      articleData.url,
    );

    try {
      // Check cache first
      if (await this.redisService.exists(cacheKey)) {
        this.logger.debug(`Skipping cached article: ${articleData.url}`);
        return;
      }

      // Check if article already exists in database
      const existingArticle = await this.articleRepository.findOne({
        where: { url: articleData.url },
      });

      if (existingArticle) {
        this.logger.debug(`Article already exists: ${articleData.title}`);
        return;
      }

      // Get or create category with retries
      let category;
      let retries = 0;
      while (retries < this.maxRetries) {
        try {
          category = await this.getOrCreateCategory(
            articleData.category as unknown as string,
          );
          break;
        } catch (error) {
          retries++;
          if (retries === this.maxRetries) throw error;
          await this.delay(this.retryDelay * retries);
        }
      }

      // Create new article
      const article = this.articleRepository.create({
        ...articleData,
        category,
        source: this.BASE_URL,
      });

      // Save article with retries
      retries = 0;
      while (retries < this.maxRetries) {
        try {
          const savedArticle = await this.articleRepository.save(article);

          // Index in Elasticsearch
          // await this.elasticsearchService.indexArticle(savedArticle);

          // Update cache and metrics
          await this.redisService.set(cacheKey, savedArticle);
          this.metricsService.incrementCrawlCount('vnexpress');

          this.logger.log(
            `Đã lưu và đánh chỉ mục bài viết mới từ Vnexpress: ${savedArticle.title}`,
          );
          break;
        } catch (error) {
          if (error.code === '23505') {
            this.logger.debug(
              `Article already exists (concurrent insert): ${articleData.title}`,
            );
            return;
          }
          retries++;
          if (retries === this.maxRetries) throw error;
          await this.delay(this.retryDelay * retries);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error saving article: ${articleData.title}`,
        error.stack,
      );
      throw error;
    }
  }

  private async getOrCreateCategory(categoryName: string): Promise<Category> {
    try {
      let category = await this.categoryRepository.findOne({
        where: { name: categoryName },
      });

      if (!category) {
        category = this.categoryRepository.create({ name: categoryName });
        await this.categoryRepository.save(category);
        this.logger.log(`Created new category: ${categoryName}`);
      }

      return category;
    } catch (error) {
      if (error.code === '23505') {
        return await this.categoryRepository.findOne({
          where: { name: categoryName },
        });
      }
      throw error;
    }
  }

  async searchByKeyword(
    keyword: string,
    filters?: {
      source?: string;
      category?: string;
      fromDate?: Date;
      toDate?: Date;
    },
  ) {
    if (this.isRunning) {
      this.logger.warn('Crawler is busy');
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting search for keyword: ${keyword}`);

    try {
      const cacheKey = this.redisService.generateKey(
        'vnexpress-search',
        keyword + JSON.stringify(filters || {}),
      );
      const cachedResults = await this.redisService.get(cacheKey);

      if (cachedResults) {
        this.logger.debug(`Returning cached search results for: ${keyword}`);
        return cachedResults;
      }

      // Search using Elasticsearch
      const results = await this.elasticsearchService.searchArticles(
        keyword,
        filters,
      );

      // Cache results for 1 hour
      await this.redisService.set(cacheKey, results, 3600);
      return results;
    } catch (error) {
      this.logger.error('Search error', error.stack);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getArticles(page = 1, limit = 10): Promise<ArticlesPaginationResult> {
    const [items, total] = await this.articleRepository.findAndCount({
      relations: ['category'],
      order: { publishDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getArticleById(id: number): Promise<Article | undefined> {
    return this.articleRepository.findOne({
      where: { id },
      relations: ['category'],
    });
  }

  async getArticlesByCategory(
    categoryName: string,
    page = 1,
    limit = 10,
  ): Promise<ArticlesPaginationResult> {
    const category = await this.categoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!category) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const [items, total] = await this.articleRepository.findAndCount({
      where: { category: { id: category.id } },
      relations: ['category'],
      order: { publishDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  stopCrawling() {
    this.isRunning = false;
    this.logger.log('Crawler stopped');
  }

  async crawlFromSitemap(year: number, limit: number) {
    if (this.isRunning) {
      this.logger.warn('Crawler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting sitemap crawl for year ${year}...`);

    try {
      const timer = this.metricsService.startCrawlTimer('vnexpress-sitemap');

      // Get main sitemap
      const mainSitemapUrl = 'https://vnexpress.net/sitemap.xml';
      const mainSitemapResponse = await this.axiosInstance.get(mainSitemapUrl);

      // Configure XML parser with more lenient options
      const parser = new xml2js.Parser({
        trim: true,
        normalize: true,
        normalizeTags: true,
        strict: false,
        explicitArray: false,
      });

      const mainSitemapData = await parser.parseStringPromise(
        mainSitemapResponse.data,
      );

      // Find the articles sitemap for the specified year
      const sitemaps = Array.isArray(mainSitemapData.sitemapindex.sitemap)
        ? mainSitemapData.sitemapindex.sitemap
        : [mainSitemapData.sitemapindex.sitemap];

      const yearSitemap = sitemaps.find(
        (sitemap) =>
          sitemap.loc && sitemap.loc.includes(`articles-${year}-sitemap.xml`),
      );

      if (!yearSitemap || !yearSitemap.loc) {
        throw new Error(`No sitemap found for year ${year}`);
      }

      // Get the year's sitemap
      const yearSitemapResponse = await this.axiosInstance.get(yearSitemap.loc);
      const yearSitemapData = await parser.parseStringPromise(
        yearSitemapResponse.data,
      );

      // Get article URLs
      const urlset = yearSitemapData.urlset;
      if (!urlset || !urlset.url) {
        throw new Error(
          'Invalid sitemap format: missing urlset or url entries',
        );
      }

      // Handle both array and single url cases
      const urlEntries = Array.isArray(urlset.url) ? urlset.url : [urlset.url];

      // Filter valid URLs and extract loc values
      const articleUrls = urlEntries
        .filter((entry) => entry && typeof entry === 'object' && entry.loc)
        .map((entry) =>
          typeof entry.loc === 'string' ? entry.loc : entry.loc[0],
        )
        .filter((url) => url && typeof url === 'string')
        .slice(0, limit);

      if (articleUrls.length === 0) {
        throw new Error('No valid article URLs found in sitemap');
      }

      this.logger.log(`Found ${articleUrls.length} articles in sitemap`);

      // Queue each URL for crawling
      for (const url of articleUrls) {
        let retries = 0;
        while (retries < this.maxRetries) {
          try {
            await this.queueSitemapCrawlJob(url);
            break;
          } catch (error) {
            retries++;
            this.logger.error(
              `Error queuing job for ${url} (attempt ${retries}/${this.maxRetries})`,
              error.stack,
            );
            if (retries < this.maxRetries) {
              await this.delay(this.retryDelay * retries);
            }
          }
        }
        await this.delay(1000); // Delay between queueing jobs
      }

      timer();
      this.logger.log('Sitemap crawl completed successfully');
      return { message: `Queued ${articleUrls.length} articles for crawling` };
    } catch (error) {
      this.logger.error('Error during sitemap crawling', error.stack);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async queueSitemapCrawlJob(url: string) {
    try {
      const job = await this.crawlerQueue.add(
        'crawl-sitemap',
        {
          url,
          mode: 'sitemap',
          workerPath: path.join(__dirname, 'sitemap.worker.js'),
        },
        {
          attempts: this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: this.retryDelay,
          },
          removeOnComplete: true,
          timeout: 300000, // 5 minutes timeout
        },
      );

      this.logger.log(`Queued sitemap job ${job.id} for ${url}`);
      return job;
    } catch (error) {
      this.logger.error(
        `Error queuing sitemap crawl job for ${url}`,
        error.stack,
      );
      throw error;
    }
  }
}
