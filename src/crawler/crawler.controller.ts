import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';

@Controller('crawler')
export class WebCrawlerController {
  constructor(private readonly webCrawlerService: WebCrawlerService) {}

  @Get('articles')
  getArticles(
    @Query('category') category?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('search') search?: string,
  ) {
    return this.webCrawlerService.getArticles(category, limit, offset, search);
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
