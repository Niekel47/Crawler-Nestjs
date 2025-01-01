import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class CrawlerQueue {
  constructor(
    @InjectQueue('crawler') private readonly crawlerQueue: Queue,
    private readonly logger: LoggingService,
  ) {}

  async addCrawlJob(data: { url: string; source: string }) {
    try {
      const job = await this.crawlerQueue.add('crawl', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
      });
      this.logger.log(`Added crawl job ${job.id} for ${data.url}`);
      return job;
    } catch (error) {
      this.logger.error('Error adding crawl job', error.stack);
      throw error;
    }
  }
}
