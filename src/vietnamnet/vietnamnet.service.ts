import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../models/article.entity';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { Category } from '../models/category.entity';
import { LoggingService } from '../logging/logging.service';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
// import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';

@Injectable()
export class VietnamnetService implements OnModuleInit {
  private readonly BASE_URL = 'https://vietnamnet.vn/';
  private isRunning = false;

  private readonly articleTypes = {
    0: 'thoi-su',
    1: 'kinh-doanh',
    2: 'the-gioi',
    3: 'giai-tri',
    4: 'the-thao',
    5: 'doi-song',
    6: 'giao-duc',
    7: 'suc-khoe',
    8: 'thong-tin-truyen-thong',
    9: 'phap-luat',
    10: 'oto-xe-may',
  };

  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectQueue('vietnamnet-crawler') private readonly crawlerQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
    // private readonly elasticsearchService: ElasticsearchService,
  ) {}

  onModuleInit() {
    // this.startCrawling();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledCrawling() {
    this.logger.log('Starting scheduled crawl...');
    await this.startCrawling();
  }

  async startCrawling() {
    if (this.isRunning) {
      this.logger.warn('VietnamNet crawler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting VietnamNet crawler...');

    try {
      const timer = this.metricsService.startCrawlTimer('vietnamnet');

      // Process each category in sequence
      for (const [, articleType] of Object.entries(this.articleTypes)) {
        await this.processCategoryWithWorker(articleType);
      }

      timer();
      this.logger.log('VietnamNet crawl completed successfully');
    } catch (error) {
      this.logger.error('Error during VietnamNet crawling', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  private async processCategoryWithWorker(articleType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'vietnamnet.worker.js'), {
        workerData: {
          articleType,
          BASE_URL: this.BASE_URL,
          mode: 'crawl',
        },
      });

      worker.on('message', async (message) => {
        if (message.type === 'article') {
          await this.saveArticle(message.data);
        } else if (message.type === 'error') {
          this.logger.error(`Worker error: ${message.data.error}`);
        } else if (message.type === 'done') {
          this.logger.log(`Completed crawling category: ${articleType}`);
        }
      });

      worker.on('error', (error) => {
        this.logger.error(`Worker error for ${articleType}: ${error.message}`);
        reject(error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  async saveArticle(articleData: Partial<Article>) {
    const cacheKey = this.redisService.generateKey(
      'vietnamnet-article',
      articleData.url,
    );

    try {
      // Check cache first
      if (await this.redisService.exists(cacheKey)) {
        this.logger.debug(
          `Skipping cached VietnamNet article: ${articleData.url}`,
        );
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

      // Get or create category
      const category = await this.getOrCreateCategory(
        articleData.category as unknown as string,
      );

      // Create new article
      const article = this.articleRepository.create({
        ...articleData,
        category,
        source: this.BASE_URL,
      });

      // Save article
      await this.articleRepository.save(article);
      // await this.elasticsearchService.indexArticle(article);

      // Update cache and metrics
      await this.redisService.set(cacheKey, article);
      this.metricsService.incrementCrawlCount('vietnamnet');

      this.logger.log(`Saved new VietnamNet article: ${articleData.title}`);
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        this.logger.debug(
          `Article already exists (concurrent insert): ${articleData.title}`,
        );
      } else {
        this.logger.error(
          `Error saving VietnamNet article: ${articleData.title}`,
          error.stack,
        );
      }
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

  async searchByKeyword(keyword: string, maxPages = 5) {
    if (this.isRunning) {
      this.logger.warn('VietnamNet crawler is busy');
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting VietnamNet search for keyword: ${keyword}`);

    try {
      const cacheKey = this.redisService.generateKey(
        'vietnamnet-search',
        keyword,
      );
      const cachedResults = await this.redisService.get(cacheKey);

      if (cachedResults) {
        this.logger.debug(
          `Returning cached VietnamNet search results for: ${keyword}`,
        );
        return cachedResults;
      }

      const worker = new Worker(path.join(__dirname, 'vietnamnet.worker.js'), {
        workerData: {
          keyword,
          maxPages,
          BASE_URL: this.BASE_URL,
          mode: 'search',
        },
      });

      const results = await new Promise((resolve, reject) => {
        const searchResults = [];

        worker.on('message', (message) => {
          if (message.type === 'searchResult') {
            searchResults.push(...message.data);
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          } else {
            resolve(searchResults);
          }
        });
      });

      await this.redisService.set(cacheKey, results, 3600); // Cache for 1 hour
      return results;
    } catch (error) {
      this.logger.error('VietnamNet search error', error.stack);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async getArticles() {
    return this.articleRepository.find({
      relations: ['category'],
      order: { publishDate: 'DESC' },
    });
  }

  async getArticleById(id: number): Promise<Article | undefined> {
    return this.articleRepository.findOne({
      where: { id },
      relations: ['category'],
    });
  }

  async getArticlesByCategory(categoryName: string) {
    const category = await this.categoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!category) {
      return [];
    }

    return this.articleRepository.find({
      where: { category: { id: category.id } },
      relations: ['category'],
      order: { publishDate: 'DESC' },
    });
  }

  stopCrawling() {
    this.isRunning = false;
    this.logger.log('VietnamNet crawler stopped');
  }
}
