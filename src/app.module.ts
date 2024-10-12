import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrawlerModule } from './crawler/crawler.module';
import { Article } from './models/article.entity';
import { VietnamnetModule } from './vietnamnet/vietnamnet.module';
// import { VietnamnetArticle } from './vietnamnet/vietnamnetarticle.entity';
import { CrawlerManagerService } from './CrawlerManager.service';
import { Category } from './models/category.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOSTNAME,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [Article, Category],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    CrawlerModule,
    VietnamnetModule,
  ],
  controllers: [],
  providers: [CrawlerManagerService],
})
export class AppModule {}
