// src/vietnamnet/vietnamnet.controller.ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { VietnamnetService } from './vietnamnet.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('vietnamnet')
@Controller('vietnamnet')
export class VietnamnetController {
  constructor(private readonly vietnamnetService: VietnamnetService) {}

  @Get('articles')
  @ApiOperation({ summary: 'Get all VietnamNet articles' })
  @ApiResponse({ status: 200, description: 'Returns all articles' })
  getArticles() {
    return this.vietnamnetService.getArticles();
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get VietnamNet article by ID' })
  @ApiResponse({ status: 200, description: 'Article found' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getArticleById(@Param('id') id: string) {
    return this.vietnamnetService.getArticleById(Number(id));
  }

  @Get('articles/category/:category')
  @ApiOperation({ summary: 'Get VietnamNet articles by category' })
  @ApiResponse({ status: 200, description: 'Returns articles in category' })
  getArticlesByCategory(@Param('category') category: string) {
    return this.vietnamnetService.getArticlesByCategory(category);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search VietnamNet articles' })
  @ApiQuery({ name: 'keyword', required: true, description: 'Search keyword' })
  @ApiQuery({
    name: 'maxPages',
    required: false,
    description: 'Maximum pages to search',
  })
  async searchArticles(
    @Query('keyword') keyword: string,
    @Query('maxPages') maxPages?: number,
  ) {
    return await this.vietnamnetService.searchByKeyword(keyword, maxPages);
  }

  @Get('start-crawl')
  @ApiOperation({ summary: 'Start VietnamNet crawler manually' })
  @ApiResponse({ status: 200, description: 'Crawler started successfully' })
  async startCrawl() {
    await this.vietnamnetService.startCrawling();
    return { message: 'VietnamNet crawler started' };
  }

  @Get('stop-crawl')
  @ApiOperation({ summary: 'Stop VietnamNet crawler' })
  @ApiResponse({ status: 200, description: 'Crawler stopped successfully' })
  stopCrawl() {
    this.vietnamnetService.stopCrawling();
    return { message: 'VietnamNet crawler stopped' };
  }
}
