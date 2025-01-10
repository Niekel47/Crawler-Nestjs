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
import { ArticlesPaginationResult } from '../crawler/type';

@Injectable()
export class TuoiTreService implements OnModuleInit {
  private readonly BASE_URL = 'https://tuoitre.vn/';
  private isRunning = false;
  private readonly maxRetries = 3;
  private readonly retryDelay = 5000;

  private readonly articleTypes = {
    0: 'thoi-su',
    1: 'the-gioi',
    2: 'phap-luat',
    3: 'kinh-doanh',
    4: 'cong-nghe',
    5: 'xe',
    6: 'nhip-song-tre',
    7: 'van-hoa',
    8: 'giai-tri',
    9: 'the-thao',
    10: 'giao-duc',
    11: 'khoa-hoc',
    12: 'suc-khoe',
  };

  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectQueue('tuoitre-crawler') private readonly crawlerQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
    private readonly redisService: RedisService,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit() {
    // Uncomment to start crawling on init
    this.startCrawling();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledCrawling() {
    this.logger.log('Starting scheduled Tuoi Tre crawl...');
    await this.startCrawling();
  }

  async startCrawling() {
    if (this.isRunning) {
      this.logger.warn('Tuoi Tre crawler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting Tuoi Tre crawler...');

    try {
      const timer = this.metricsService.startCrawlTimer('tuoitre');

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
      this.logger.log('Tuoi Tre crawl completed successfully');
    } catch (error) {
      this.logger.error('Error during Tuoi Tre crawling', error.stack);
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
      'tuoitre-article',
      articleData.url,
    );

    try {
      this.logger.log(
        `[SAVE_START] Bắt đầu xử lý lưu bài viết: ${articleData.title}`,
      );

      // Check cache first
      if (await this.redisService.exists(cacheKey)) {
        this.logger.log(
          `[CACHE_SKIP] Bài viết đã tồn tại trong cache: ${articleData.title}`,
        );
        return;
      }
      this.logger.log(
        `[CACHE_CHECK] Bài viết chưa có trong cache: ${articleData.title}`,
      );

      // Check if article already exists in database
      const existingArticle = await this.articleRepository.findOne({
        where: { url: articleData.url },
      });

      if (existingArticle) {
        this.logger.log(
          `[DB_SKIP] Bài viết đã tồn tại trong database: ${articleData.title}`,
        );
        return;
      }
      this.logger.log(
        `[DB_CHECK] Bài viết chưa có trong database: ${articleData.title}`,
      );

      // Get or create category
      this.logger.log(
        `[CATEGORY_START] Đang xử lý category cho bài: ${articleData.title}`,
      );
      const category = await this.getOrCreateCategory(
        articleData.category as unknown as string,
      );
      this.logger.log(
        `[CATEGORY_DONE] Đã xử lý xong category: ${category.name}`,
      );

      // Create new article
      this.logger.log(
        `[DB_SAVE_START] Đang lưu bài viết vào database: ${articleData.title}`,
      );
      const article = this.articleRepository.create({
        ...articleData,
        category,
        source: this.BASE_URL,
      });

      // Save article
      await this.articleRepository.save(article);
      this.logger.log(
        `[DB_SAVE_SUCCESS] Đã lưu thành công vào database: ${articleData.title}`,
      );

      // Update cache and metrics
      this.logger.log(
        `[CACHE_UPDATE] Đang cập nhật cache cho bài viết: ${articleData.title}`,
      );
      await this.redisService.set(cacheKey, article);
      this.logger.log(
        `[CACHE_UPDATED] Đã cập nhật cache thành công: ${articleData.title}`,
      );

      this.metricsService.incrementCrawlCount('tuoitre');
      this.logger.log(
        `[METRICS_UPDATED] Đã cập nhật metrics cho bài viết: ${articleData.title}`,
      );

      this.logger.log(
        `[SAVE_SUCCESS] Hoàn thành toàn bộ quá trình lưu bài viết: ${articleData.title} - Category: ${category.name}`,
      );
    } catch (error) {
      if (error.code === '23505') {
        this.logger.warn(
          `[DUPLICATE] Bài viết bị trùng lặp (concurrent insert): ${articleData.title}`,
        );
      } else {
        this.logger.error(
          `[SAVE_ERROR] Lỗi khi lưu bài viết: ${articleData.title}`,
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
      this.logger.warn('Tuoi Tre crawler is busy');
      return;
    }

    this.isRunning = true;
    this.logger.log(`Starting search for keyword: ${keyword}`);

    try {
      const cacheKey = this.redisService.generateKey('tuoitre-search', keyword);
      const cachedResults = await this.redisService.get(cacheKey);

      if (cachedResults) {
        this.logger.debug(`Returning cached search results for: ${keyword}`);
        return cachedResults;
      }

      let retries = 0;
      while (retries < this.maxRetries) {
        try {
          const worker = new Worker(path.join(__dirname, 'tuoitre.worker.js'), {
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
          retries++;
          this.logger.error(
            `Search error (attempt ${retries}/${this.maxRetries})`,
            error.stack,
          );
          if (retries === this.maxRetries) throw error;
          await this.delay(this.retryDelay * retries);
        }
      }
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
    this.logger.log('Tuoi Tre crawler stopped');
  }
}
