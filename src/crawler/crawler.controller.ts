import { Controller, Get } from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';

@Controller('crawler')
export class WebCrawlerController {
  constructor(private readonly webCrawlerService: WebCrawlerService) {}

  @Get('articles')
  getArticles() {
    return this.webCrawlerService.getArticles();
  }
}
