import { Controller, Get, Query } from '@nestjs/common';
import { GoogleSearchService } from './google-search.service';
import { SearchResult } from './types';

@Controller('google-search')
export class GoogleSearchController {
  constructor(private readonly googleSearchService: GoogleSearchService) {}

  @Get('search')
  async searchKeyword(
    @Query('keyword') keyword: string,
  ): Promise<SearchResult[]> {
    if (!keyword) {
      throw new Error('Keyword is required');
    }
    return this.googleSearchService.searchKeyword(keyword);
  }

  @Get('search-with-details')
  async searchKeywordWithDetails(
    @Query('keyword') keyword: string,
  ): Promise<SearchResult[]> {
    return this.googleSearchService.searchKeywordWithDetails(keyword);
  }

  @Get('search-without-sites')
  async searchKeywordWithoutSites(
    @Query('keyword') keyword: string,
  ): Promise<SearchResult[]> {
    if (!keyword) {
      throw new Error('Keyword is required');
    }
    return this.googleSearchService.searchKeywordWithoutSites(keyword);
  }
}
