import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';

@Controller('crawler')
export class WebCrawlerController {
  constructor(private readonly webCrawlerService: WebCrawlerService) {}

  @Get('articles')
  getArticles() {
    return this.webCrawlerService.getArticles();
  }

  @Get('articles/:id')
  getArticleById(@Param('id', ParseIntPipe) id: number) {
    return this.webCrawlerService.getArticleById(id);
  }

  @Get('articles/category/:category')
  getArticlesByCategory(@Param('category') category: string) {
    return this.webCrawlerService.getArticlesByCategory(category);
  }
}
