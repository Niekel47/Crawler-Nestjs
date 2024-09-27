import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VietnamnetArticle } from './vietnamnetarticle.entity';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'worker_threads';
import * as path from 'path';

@Injectable()
export class VietnamnetService {
  private urlCache: Map<string, Date> = new Map();
  private CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    @InjectRepository(VietnamnetArticle)
    private vietnamnetArticleRepository: Repository<VietnamnetArticle>,
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

    const existingArticle = await this.vietnamnetArticleRepository.findOne({
      where: { url: articleData.url },
    });
    if (!existingArticle) {
      const article = this.vietnamnetArticleRepository.create(articleData);
      await this.vietnamnetArticleRepository.save(article);
      console.log(`Saved new VietnamNet article: ${articleData.title}`);
      this.addToCache(articleData.url);
    }
  }

  stopCrawling() {
    this.isRunning = false;
  }

  async getArticles() {
    return this.vietnamnetArticleRepository.find();
  }
}
