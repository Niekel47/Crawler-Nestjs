// src/crawler/crawler.controller.ts
import {
  Controller,
  Get,
  Query,
  Param,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { WebCrawlerService } from './crawler.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { VnExpressWorker } from './vnexpress.worker';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@ApiTags('crawler')
@Controller('crawler')
export class WebCrawlerController {
  constructor(
    private readonly webCrawlerService: WebCrawlerService,
    private readonly vnexpressWorker: VnExpressWorker,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

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
  @ApiOperation({ summary: 'Search articles by keyword using Elasticsearch' })
  @ApiQuery({ name: 'keyword', required: true, type: String })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  async searchArticles(
    @Query('keyword') keyword: string,
    @Query('source') source?: string,
    @Query('category') category?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const filters = {
      source,
      category,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    };
    return this.webCrawlerService.searchByKeyword(keyword, filters);
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

  @Post('sitemap')
  @ApiOperation({ summary: 'Crawl articles from sitemap' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async crawlFromSitemap(
    @Query('year') year?: number,
    @Query('limit') limit?: number,
  ) {
    return await this.webCrawlerService.crawlFromSitemap(
      year || new Date().getFullYear(),
      limit || 10,
    );
  }

  @Post('vnexpress')
  async crawlVnExpress(@Body('url') url: string) {
    try {
      const article = await this.vnexpressWorker.crawlArticle(url);
      return {
        success: true,
        data: article,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('vnexpress/links')
  async getVnExpressLinks(@Query('url') url: string) {
    try {
      const links = await this.vnexpressWorker.extractLinksFromArticle(url);
      return {
        success: true,
        data: links,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('sync-elastic')
  @ApiOperation({ summary: 'Sync all articles to Elasticsearch' })
  async syncToElastic() {
    try {
      const { items: articles } = await this.webCrawlerService.getArticles(
        1,
        1000,
      );
      const result =
        await this.elasticsearchService.syncArticlesToElastic(articles);
      return {
        success: true,
        message: 'Articles synced to Elasticsearch successfully',
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
