// src/queue/crawler.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggingService } from '../logging/logging.service';
import { WebCrawlerService } from '../crawler/crawler.service';
import { Worker } from 'worker_threads';
import * as path from 'path';

@Processor('crawler')
export class CrawlerProcessor {
  constructor(
    private readonly logger: LoggingService,
    private readonly crawlerService: WebCrawlerService,
  ) {}

  @Process('crawl')
  async handleCrawl(job: Job) {
    try {
      this.logger.log(`Processing crawl job ${job.id}`);
      await this.processCrawling(job.data);
      this.logger.log(`Completed crawl job ${job.id}`);
    } catch (error) {
      this.logger.error(`Error in crawl job ${job.id}`, error.stack);
      throw error;
    }
  }

  private async processCrawling(data: {
    articleType: string;
    BASE_URL: string;
    mode: string;
  }) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        path.join(__dirname, '../crawler/crawler.worker.js'),
        {
          workerData: data,
        },
      );

      worker.on('message', async (message) => {
        if (message.type === 'article') {
          await this.crawlerService.saveArticle(message.data);
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        } else {
          resolve(true);
        }
      });
    });
  }
}
