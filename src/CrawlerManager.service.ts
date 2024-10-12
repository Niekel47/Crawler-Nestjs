import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebCrawlerService } from './crawler/crawler.service';
import { VietnamnetService } from './vietnamnet/vietnamnet.service';

@Injectable()
export class CrawlerManagerService implements OnModuleInit {
  constructor(
    private vietnamNetCrawlerService: VietnamnetService,
    private webCrawlerService: WebCrawlerService,
  ) {}

  onModuleInit() {
    this.startCrawling();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledCrawling() {
    console.log('Bắt đầu crawl theo lịch...');
    await this.startCrawling();
  }

  private async startCrawling() {
    console.log('Bắt đầu crawl...');
    await Promise.all([
      this.vietnamNetCrawlerService.startCrawling(),
      this.webCrawlerService.startCrawling(), //VnExpress crawler
    ]);
    console.log('Crawl hoàn tất');
  }

  stopCrawling() {
    this.vietnamNetCrawlerService.stopCrawling();
    this.webCrawlerService.stopCrawling();
  }

  async getArticles() {
    // const vietnamnetArticles =
    //   await this.vietnamNetCrawlerService.getArticles();
    const webCrawlerArticles = await this.webCrawlerService.getArticles();
    return [webCrawlerArticles];
  }
}
