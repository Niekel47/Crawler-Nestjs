import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';

@Controller('crawler')
export class WebCrawlerController {
  constructor(private readonly webCrawlerService: WebCrawlerService) {}

  @Get('articles')
  async getArticles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sort') sort?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.webCrawlerService.getArticles(
      page,
      limit,
      sort,
      search,
      category,
    );
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
