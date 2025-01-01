// src/vietnamnet/vietnamnet.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VietnamnetService } from './vietnamnet.service';
import { VietnamnetController } from './vietnamnet.controller';
import { Category } from 'src/models/category.entity';
import { Article } from 'src/models/article.entity';
import { RedisService } from 'src/redis/redis.service';
import { LoggingService } from 'src/logging/logging.service';
import { SearchService } from 'src/search/search.service';
import { VietnamnetProcessor } from './vietnamnet.processor';
import { BullModule } from '@nestjs/bull';
import { LoggingModule } from 'src/logging/logging.module';
import { UtilsModule } from 'src/utils/utils.module';
import { MetricsModule } from 'src/metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, Category]),
    BullModule.registerQueue({
      name: 'vietnamnet-crawler',
    }),
    LoggingModule,
    MetricsModule,
    UtilsModule,
  ],
  controllers: [VietnamnetController],
  providers: [
    VietnamnetService,
    LoggingService,
    SearchService,
    VietnamnetProcessor,
    RedisService,
  ],
  exports: [VietnamnetService],
})
export class VietnamnetModule {}
