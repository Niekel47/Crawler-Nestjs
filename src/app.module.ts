import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrawlerModule } from './crawler/crawler.module';
import { Article } from './models/article.entity';
import { VietnamnetModule } from './vietnamnet/vietnamnet.module';
import { CrawlerManagerService } from './CrawlerManager.service';
import { Category } from './models/category.entity';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { Role } from './models/role.entity';
import { User } from './models/user.entity';
import { RoleModule } from './role/role.module';
import { TwentyFourHModule } from './24h.com/24h.module';
import { OpenAIService } from './openai.service';
import { MetricsModule } from './metrics/metrics.module';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { RedisService } from './redis/redis.service';
import { LoggingService } from './logging/logging.service';
import { ContentAnalyzerService } from './content_analyzer/content_analyzer.service';
// import { TuoitreModule } from './tuoitre/tuoitre.module';

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
      entities: [Article, Category, User, Role],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),

    PassportModule,
    CrawlerModule,
    VietnamnetModule,
    AuthModule,
    UserModule,
    RoleModule,
    TwentyFourHModule,
    MetricsModule,
    // TuoitreModule,
  ],

  providers: [
    CrawlerManagerService,
    OpenAIService,
    RedisService,
    LoggingService,
    ContentAnalyzerService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        { path: 'crawler/start-crawl', method: RequestMethod.GET },
        { path: 'vietnamnet/start-crawl', method: RequestMethod.GET },
      );
  }
}
