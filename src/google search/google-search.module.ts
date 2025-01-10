import { Module } from '@nestjs/common';
import { GoogleSearchService } from './google-search.service';
import { GoogleSearchController } from './googl-search.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [GoogleSearchService],
  controllers: [GoogleSearchController],
  exports: [GoogleSearchService],
})
export class GoogleSearchModule {}
