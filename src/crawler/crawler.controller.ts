// src/crawler/crawler.controller.ts
import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('crawler')
@Controller('crawler')
export class WebCrawlerController {
  constructor(private readonly webCrawlerService: WebCrawlerService) {}

  @Get('articles')
  @ApiOperation({ summary: 'Get all articles with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getArticles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.webCrawlerService.getArticles(page || 1, limit || 10);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiResponse({ status: 200, description: 'Article found' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getArticleById(@Param('id', ParseIntPipe) id: number) {
    return this.webCrawlerService.getArticleById(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search articles by keyword' })
  @ApiQuery({ name: 'keyword', required: true, type: String })
  async searchArticles(@Query('keyword') keyword: string) {
    return await this.webCrawlerService.searchByKeyword(keyword);
  }

  @Get('category/:name')
  @ApiOperation({ summary: 'Get articles by category' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getArticlesByCategory(
    @Param('name') categoryName: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.webCrawlerService.getArticlesByCategory(
      categoryName,
      page || 1,
      limit || 10,
    );
  }
}
