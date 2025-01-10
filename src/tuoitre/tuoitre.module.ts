import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TuoiTreService } from './tuoitre.service';
import { TuoitreController } from './tuoitre.controller';
import { Article } from '../models/article.entity';
import { Category } from '../models/category.entity';
import { BullModule } from '@nestjs/bull';
import { LoggingModule } from '../logging/logging.module';
import { MetricsModule } from '../metrics/metrics.module';
import { SearchService } from 'src/search/search.service';
import { RedisService } from 'src/redis/redis.service';
import { LoggingService } from 'src/logging/logging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, Category]),
    BullModule.registerQueue({
      name: 'tuoitre-crawler',
    }),
    LoggingModule,
    MetricsModule,
  ],
  providers: [
    TuoiTreService,
    LoggingService,
    SearchService,
    // TuoiTreProcessor,
    RedisService,
  ],
  controllers: [TuoitreController],
  exports: [TuoiTreService],
})
export class TuoitreModule {}
