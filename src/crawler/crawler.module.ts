// src/crawler/crawler.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WebCrawlerController } from './crawler.controller';
import { WebCrawlerService } from './crawler.service';
import { Article } from '../models/article.entity';
import { Category } from '../models/category.entity';
import { LoggingService } from '../logging/logging.service';
import { SearchService } from '../search/search.service';
import { CrawlerProcessor } from '../queue/crawler.processor';
import { RedisService } from '../redis/redis.service';
import { UtilsModule } from 'src/utils/utils.module';
import { LoggingModule } from 'src/logging/logging.module';
import { MetricsModule } from 'src/metrics/metrics.module';
import { WebGraphController } from './web-graph.controller';
import { WebGraphCrawlerService } from './web-graph.crawler';
import { PageRankService } from './page-rank.service';
import { SearchWithPageRankService } from './search_engine.service';
import { ContentAnalyzerService } from 'src/content_analyzer/content_analyzer.service';
import { VnExpressWorker } from './vnexpress.worker';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, Category]),
    BullModule.registerQueue({
      name: 'crawler',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }),
    LoggingModule,
    MetricsModule,
    UtilsModule,
  ],
  controllers: [WebCrawlerController, WebGraphController],
  providers: [
    WebCrawlerService,
    WebGraphCrawlerService,
    PageRankService,
    LoggingService,
    SearchService,
    CrawlerProcessor,
    RedisService,
    SearchWithPageRankService,
    ContentAnalyzerService,
    VnExpressWorker,
    ElasticsearchService,
  ],
  exports: [WebCrawlerService],
})
export class CrawlerModule {}
