import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentProcessorService } from './content-processor.service';

@Module({
  imports: [ConfigModule],
  providers: [ContentProcessorService],
  exports: [ContentProcessorService],
})
export class ContentProcessorModule {}
