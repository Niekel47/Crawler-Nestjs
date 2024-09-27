import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebCrawlerController } from './crawler.controller';
import { WebCrawlerService } from './crawler.service';
import { Article } from './article.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article])],
  controllers: [WebCrawlerController],
  providers: [WebCrawlerService],
  exports: [WebCrawlerService],
})
export class CrawlerModule {}
