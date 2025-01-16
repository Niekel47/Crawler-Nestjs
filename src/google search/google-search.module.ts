import { Module } from '@nestjs/common';
import { GoogleSearchService } from './google-search.service';
import { GoogleSearchController } from './googl-search.controller';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import { LoggingModule } from 'src/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule],
  providers: [GoogleSearchService, RedisService],
  controllers: [GoogleSearchController],
  exports: [GoogleSearchService],
})
export class GoogleSearchModule {}
