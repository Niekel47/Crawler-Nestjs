import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VietnamnetService } from './vietnamnet.service';
import { VietnamnetController } from './vietnamnet.controller';
import { VietnamnetArticle } from './vietnamnetarticle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VietnamnetArticle])],
  controllers: [VietnamnetController],
  providers: [VietnamnetService],
  exports: [VietnamnetService],
})
export class VietnamnetModule {}
