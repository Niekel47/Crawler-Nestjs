import { Module } from '@nestjs/common';
import { ContentClassificationService } from './content_classification.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [ContentClassificationService],
  exports: [ContentClassificationService],
})
export class ContentClassificationModule {}
