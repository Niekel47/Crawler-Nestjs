// src/vietnamnet/vietnamnet.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggingService } from '../logging/logging.service';
import { VietnamnetService } from './vietnamnet.service';
import { Worker } from 'worker_threads';
import * as path from 'path';

// @Processor('vietnamnet-crawler')
export class VietnamnetProcessor {
  constructor(
    private readonly logger: LoggingService,
    private readonly vietnamnetService: VietnamnetService,
  ) {}

  // @Process('crawl')
  async handleCrawl(job: Job) {
    try {
      this.logger.log(`Processing VietnamNet crawl job ${job.id}`);
      await this.processCrawling(job.data);
      this.logger.log(`Completed VietnamNet crawl job ${job.id}`);
    } catch (error) {
      this.logger.error(`Error in VietnamNet crawl job ${job.id}`, error.stack);
      throw error;
    }
  }

  private async processCrawling(data: {
    articleType: string;
    BASE_URL: string;
    mode: string;
  }) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'vietnamnet.worker.js'), {
        workerData: data,
      });

      worker.on('message', async (message) => {
        if (message.type === 'article') {
          await this.vietnamnetService.saveArticle(message.data);
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
