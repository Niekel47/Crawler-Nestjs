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

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledCrawling() {
    console.log('Bắt đầu crawl theo lịch...');
    await this.startCrawling();
  }

  private async startCrawling() {
    console.log('Bắt đầu VietnamNet crawler...');
    await this.vietnamNetCrawlerService.startCrawling();
    console.log('VietnamNet crawl hoàn tất');

    console.log('Bắt đầu WebCrawler...');
    await this.webCrawlerService.startCrawling();
    console.log('WebCrawler hoàn tất');
  }

  stopCrawling() {
    this.vietnamNetCrawlerService.stopCrawling();
    this.webCrawlerService.stopCrawling();
  }

  async getArticles() {
    const vietnamnetArticles =
      await this.vietnamNetCrawlerService.getArticles();
    const webCrawlerArticles = await this.webCrawlerService.getArticles();
    return [...vietnamnetArticles, ...webCrawlerArticles];
  }
}
