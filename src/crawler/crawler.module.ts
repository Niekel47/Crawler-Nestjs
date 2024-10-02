import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebCrawlerController } from './crawler.controller';
import { WebCrawlerService } from './crawler.service';
import { Article } from '../models/article.entity';
import { Category } from 'src/models/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article, Category])],
  controllers: [WebCrawlerController],
  providers: [WebCrawlerService],
  exports: [WebCrawlerService],
})
export class CrawlerModule {}
