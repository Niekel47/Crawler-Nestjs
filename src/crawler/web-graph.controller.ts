import { Controller, Get, Query } from '@nestjs/common';
import { WebGraphCrawlerService, CrawlResult } from './web-graph.crawler';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PageRankService, RankResponse } from './page-rank.service';
import { SearchWithPageRankService, PageWeight } from './search_engine.service';
import * as fs from 'fs';
import * as path from 'path';

interface DeepOceanData {
  crawling_result: any;
  seed_URL: string;
  indexed: any;
  ranks: any;
  url_page_title_map: any;
}

@ApiTags('web-graph')
@Controller('web-graph')
export class WebGraphController {
  private deepOceanData: DeepOceanData = {
    crawling_result: {},
    seed_URL: '',
    indexed: {},
    ranks: {},
    url_page_title_map: {},
  };

  constructor(
    private readonly webGraphService: WebGraphCrawlerService,
    private readonly pageRankService: PageRankService,
    private readonly searchService: SearchWithPageRankService,
  ) {}

  @Get('crawl')
  @ApiOperation({ summary: 'Crawl a website and create a graph of its links' })
  @ApiQuery({ name: 'url', required: true, type: String })
  @ApiQuery({ name: 'maxIterations', required: false, type: Number })
  @ApiQuery({ name: 'maxPages', required: false, type: Number })
  async crawlWebsite(
    @Query('url') url: string,
    @Query('maxIterations') maxIterations?: number,
    @Query('maxPages') maxPages?: number,
  ): Promise<CrawlResult> {
    const result = await this.webGraphService.webCrawl(
      url,
      maxIterations || 3,
      maxPages || 50,
    );

    // Save crawl data
    this.deepOceanData.crawling_result = result.crawling_result;
    this.deepOceanData.seed_URL = url;
    this.deepOceanData.indexed = result.indexed;
    this.deepOceanData.url_page_title_map = result.url_page_title_map;

    // Save to files after crawling
    const dataDir = path.join(process.cwd(), 'crawl_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dataDir, 'data.json'),
      JSON.stringify(
        {
          crawling_result: this.deepOceanData.crawling_result,
          seed_url: this.deepOceanData.seed_URL,
          ranks: this.deepOceanData.ranks,
          url_page_title_map: this.deepOceanData.url_page_title_map,
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(dataDir, 'indexed.txt'),
      JSON.stringify(this.deepOceanData.indexed),
    );

    console.log('Crawl data saved to:', dataDir);
    return result;
  }

  @Get('rank')
  async getRanking(@Query('url') url: string): Promise<RankResponse | []> {
    // Try to use saved data first
    const savedData = await this.loadSavedData();
    if (savedData && savedData.seed_URL === url) {
      const rankResult = await this.pageRankService.startRanking(
        savedData.crawling_result,
      );
      if (!Array.isArray(rankResult)) {
        this.deepOceanData.ranks = rankResult.ranks_keep;
        await this.saveData();
      }
      return rankResult;
    }

    // If no saved data or different URL, crawl again
    const crawlResult = await this.webGraphService.webCrawl(url);
    const rankResult = await this.pageRankService.startRanking(
      crawlResult.crawling_result,
    );

    if (!Array.isArray(rankResult)) {
      this.deepOceanData.ranks = rankResult.ranks_keep;
      await this.saveData();
    }

    return rankResult;
  }

  private async saveData(): Promise<void> {
    try {
      const dataDir = path.join(process.cwd(), 'crawl_data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(dataDir, 'data.json'),
        JSON.stringify(
          {
            crawling_result: this.deepOceanData.crawling_result,
            seed_url: this.deepOceanData.seed_URL,
            ranks: this.deepOceanData.ranks,
            url_page_title_map: this.deepOceanData.url_page_title_map,
          },
          null,
          2,
        ),
      );

      fs.writeFileSync(
        path.join(dataDir, 'indexed.txt'),
        JSON.stringify(this.deepOceanData.indexed),
      );

      console.log('Data saved to:', dataDir);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  @Get('load-data')
  async loadSavedData(): Promise<DeepOceanData | null> {
    try {
      const dataDir = path.join(process.cwd(), 'crawl_data');
      const dataPath = path.join(dataDir, 'data.json');
      const indexedPath = path.join(dataDir, 'indexed.txt');

      if (!fs.existsSync(dataPath) || !fs.existsSync(indexedPath)) {
        console.log('No saved data found in:', dataDir);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const indexed = JSON.parse(fs.readFileSync(indexedPath, 'utf8'));

      this.deepOceanData = {
        crawling_result: data.crawling_result,
        seed_URL: data.seed_url,
        indexed: indexed,
        ranks: data.ranks,
        url_page_title_map: data.url_page_title_map,
      };

      console.log('Data loaded from:', dataDir);
      return this.deepOceanData;
    } catch (error) {
      console.error('Error loading saved data:', error);
      return null;
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search through crawled pages using PageRank' })
  @ApiQuery({ name: 'url', required: true, type: String })
  @ApiQuery({ name: 'query', required: true, type: String })
  async search(
    @Query('url') url: string,
    @Query('query') query: string,
  ): Promise<PageWeight[]> {
    if (!query || !url) {
      return [];
    }

    // Try to use saved data first
    const savedData = await this.loadSavedData();
    if (savedData && savedData.seed_URL === url) {
      return this.searchService.search(
        query,
        savedData.indexed,
        savedData.ranks,
        savedData.url_page_title_map,
      );
    }

    // If no saved data or different URL, crawl again
    const crawlResult = await this.webGraphService.webCrawl(url);
    const rankResult = await this.pageRankService.startRanking(
      crawlResult.crawling_result,
    );

    if (Array.isArray(rankResult)) {
      return [];
    }

    return this.searchService.search(
      query,
      crawlResult.indexed,
      rankResult.ranks_keep,
      crawlResult.url_page_title_map,
    );
  }
}
