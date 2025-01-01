import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../models/article.entity';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Category } from '../models/category.entity';

@Injectable()
export class TwentyFourHService implements OnModuleInit {
  private urlCache: Map<string, Date> = new Map();
  private CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private configService: ConfigService,
  ) {}

  private BASE_URL = 'https://www.24h.com.vn/';
  private articleTypes = {
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
    11: 'chinh-tri-xa-hoi',
  };

  private isRunning = false;

  onModuleInit() {
    // this.startCrawling();
    console.log('24h.com.vn crawler disabled');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledCrawling() {
    console.log('Bắt đầu crawl 24h.com.vn theo lịch...');
    await this.startCrawling();
  }

  public async startCrawling() {
    if (this.isRunning) {
      console.log('24h.com.vn crawler đang chạy');
      return;
    }

    this.isRunning = true;
    console.log('Bắt đầu crawler 24h.com.vn...');

    try {
      const workerPromises = Object.entries(this.articleTypes).map(
        ([, articleType]) => {
          return new Promise<void>((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, '24h.worker.js'), {
              workerData: { articleType, BASE_URL: this.BASE_URL },
            });

            worker.on('message', async (message) => {
              if (message.type === 'article') {
                await this.saveArticle(message.data);
              }
            });

            worker.on('error', reject);
            worker.on('exit', (code) => {
              if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
              } else {
                resolve();
              }
            });
          });
        },
      );

      await Promise.all(workerPromises);
    } catch (error) {
      console.error('Lỗi trong quá trình crawl 24h.com.vn:', error);
    } finally {
      this.isRunning = false;
      console.log('Crawl 24h.com.vn hoàn tất');
    }
  }

  private async saveArticle(articleData: Partial<Article>) {
    if (this.isCached(articleData.url)) {
      console.log(`Bỏ qua bài viết đã cache: ${articleData.url}`);
      return;
    }

    try {
      const existingArticle = await this.articleRepository.findOne({
        where: { url: articleData.url },
      });

      if (!existingArticle) {
        const category = await this.getOrCreateCategory(
          articleData.category as unknown as string,
        );
        const article = this.articleRepository.create({
          ...articleData,
          category: category,
          source: articleData.url, // Sử dụng URL của bài viết làm source
        });
        await this.articleRepository.save(article);
        console.log(`Đã lưu bài viết mới: ${articleData.title}`);
        this.addToCache(articleData.url);
      } else {
        console.log(`Bài viết đã tồn tại: ${articleData.title}`);
      }
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        console.log(
          `Bài viết đã tồn tại (concurrent insert): ${articleData.title}`,
        );
      } else {
        console.error(`Lỗi khi lưu bài viết: ${articleData.title}`, error);
      }
    }
  }

  private isCached(url: string): boolean {
    const cachedDate = this.urlCache.get(url);
    if (cachedDate) {
      const now = new Date();
      return now.getTime() - cachedDate.getTime() < this.CACHE_DURATION;
    }
    return false;
  }

  private addToCache(url: string) {
    this.urlCache.set(url, new Date());
  }

  private async getOrCreateCategory(categoryName: string): Promise<Category> {
    let category = await this.categoryRepository.findOne({
      where: { name: categoryName },
    });

    if (!category) {
      category = this.categoryRepository.create({ name: categoryName });
      await this.categoryRepository.save(category);
    }

    return category;
  }

  async getArticles(page = 1, limit = 10) {
    const query = this.articleRepository
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.category', 'category')
      .orderBy('article.publishDate', 'DESC');

    const offset = (page - 1) * limit;

    query.skip(offset).take(limit);

    const [articles, total] = await query.getManyAndCount();

    return {
      data: articles,
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
    });
  }
}
