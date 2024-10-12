import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VietnamnetService } from './vietnamnet.service';
import { VietnamnetController } from './vietnamnet.controller';
// import { VietnamnetArticle } from './vietnamnetarticle.entity';
import { Category } from 'src/models/category.entity';
import { Article } from 'src/models/article.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article, Category])],
  controllers: [VietnamnetController],
  providers: [VietnamnetService],
  exports: [VietnamnetService],
})
export class VietnamnetModule {}
