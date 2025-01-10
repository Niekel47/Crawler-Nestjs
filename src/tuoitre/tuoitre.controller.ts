import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { TuoiTreService } from './tuoitre.service';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('tuoitre')
@Controller('tuoitre')
export class TuoitreController {
  constructor(private readonly tuoitreService: TuoiTreService) {}

  @Get('articles')
  @ApiOperation({ summary: 'Get all articles with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getArticles(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.tuoitreService.getArticles(page || 1, limit || 10);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get article by ID' })
  @ApiResponse({ status: 200, description: 'Article found' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  getArticleById(@Param('id', ParseIntPipe) id: number) {
    return this.tuoitreService.getArticleById(id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search articles by keyword' })
  @ApiQuery({ name: 'keyword', required: true, type: String })
  async searchArticles(@Query('keyword') keyword: string) {
    return await this.tuoitreService.searchByKeyword(keyword);
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
    return this.tuoitreService.getArticlesByCategory(
      categoryName,
      page || 1,
      limit || 10,
    );
  }
}
