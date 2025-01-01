import { Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';
import { LoggingModule } from '../logging/logging.module';

@Module({
  imports: [LoggingModule],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class UtilsModule {}
