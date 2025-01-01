import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwentyFourHService } from './24h.service';
import { TwentyFourHController } from './24h.controller';
import { Article } from '../models/article.entity';
import { Category } from 'src/models/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article, Category])],
  providers: [TwentyFourHService],
  controllers: [TwentyFourHController],
  exports: [TwentyFourHService],
})
export class TwentyFourHModule {}
