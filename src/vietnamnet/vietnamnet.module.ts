import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VietnamnetService } from './vietnamnet.service';
import { VietnamnetController } from './vietnamnet.controller';
import { VietnamnetArticle } from './vietnamnetarticle.entity';
import { Category } from 'src/models/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VietnamnetArticle, Category])],
  controllers: [VietnamnetController],
  providers: [VietnamnetService],
  exports: [VietnamnetService],
})
export class VietnamnetModule {}
