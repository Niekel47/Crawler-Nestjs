import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VietnamnetArticle } from './vietnamnetarticle.entity';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { Category } from '../models/category.entity';

@Injectable()
export class VietnamnetService {
  private urlCache: Map<string, Date> = new Map();
  private CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    @InjectRepository(VietnamnetArticle)
    private vietnamnetArticleRepository: Repository<VietnamnetArticle>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private configService: ConfigService,
  ) {}

  private BASE_URL = 'https://vietnamnet.vn/';
  private articleTypes = {
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

  private isRunning = false;

  public async startCrawling() {
    if (this.isRunning) {
      console.log('VietnamNet Crawler is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting VietnamNet crawler...');

    try {
      const workerPromises = Object.entries(this.articleTypes).map(
        ([, articleType]) => {
          return new Promise<void>((resolve, reject) => {
            const worker = new Worker(
              path.join(__dirname, 'vietnamnet.worker.js'),
              {
                workerData: { articleType, BASE_URL: this.BASE_URL },
              },
            );

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
      console.error('Error in VietnamNet crawling process:', error);
    } finally {
      this.isRunning = false;
      console.log('VietnamNet Crawl completed');
    }
  }

  private isCached(url: string): boolean {
    const cachedTime = this.urlCache.get(url);
    if (
      cachedTime &&
      new Date().getTime() - cachedTime.getTime() < this.CACHE_DURATION
    ) {
      return true;
    }
    return false;
  }

  private addToCache(url: string) {
    this.urlCache.set(url, new Date());
  }

  private async saveArticle(articleData: Partial<VietnamnetArticle>) {
    if (this.isCached(articleData.url)) {
      console.log(`Skipping cached article: ${articleData.url}`);
      return;
    }

    try {
      const existingArticle = await this.vietnamnetArticleRepository.findOne({
        where: { url: articleData.url },
      });

      if (!existingArticle) {
        const category = await this.getOrCreateCategory(
          articleData.category as unknown as string,
        );
        const article = this.vietnamnetArticleRepository.create({
          ...articleData,
          category: category,
        });
        await this.vietnamnetArticleRepository.save(article);
        console.log(`Saved new VietnamNet article: ${articleData.title}`);
        this.addToCache(articleData.url);
      } else {
        console.log(`Article already exists: ${articleData.title}`);
      }
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        console.log(
          `Article already exists (concurrent insert): ${articleData.title}`,
        );
      } else {
        console.error(`Error saving article: ${articleData.title}`, error);
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
      }
      return category;
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        // If the error is due to a duplicate, try to fetch the category again
        return await this.categoryRepository.findOne({
          where: { name: categoryName },
        });
      }
      throw error; // If it's a different error, rethrow it
    }
  }

  stopCrawling() {
    this.isRunning = false;
  }

  async getArticles() {
    return this.vietnamnetArticleRepository.find({ relations: ['category'] });
  }

  async getArticleById(id: number): Promise<VietnamnetArticle | undefined> {
    return this.vietnamnetArticleRepository.findOne({
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
    return this.vietnamnetArticleRepository.find({
      where: { category: { id: category.id } },
      relations: ['category'],
    });
  }
}
