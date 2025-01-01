import { Module } from '@nestjs/common';
import { ContentAnalyzerService } from './content_analyzer.service';

import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [ContentAnalyzerService],
  exports: [ContentAnalyzerService],
})
export class ContentAnalyzerModule {}
