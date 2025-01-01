import { Injectable } from '@nestjs/common';
import { RateLimiter } from 'limiter';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class RateLimiterService {
  private limiters: Map<string, RateLimiter>;
  private defaultLimiter: RateLimiter;

  constructor(private readonly logger: LoggingService) {
    this.limiters = new Map();
    this.initializeLimiters();
  }

  private initializeLimiters() {
    // VnExpress: 3 requests mỗi giây
    this.limiters.set(
      'vnexpress.net',
      new RateLimiter({
        tokensPerInterval: 3,
        interval: 'second',
      }),
    );

    // Vietnamnet: 2 requests mỗi giây
    this.limiters.set(
      'vietnamnet.vn',
      new RateLimiter({
        tokensPerInterval: 2,
        interval: 'second',
      }),
    );

    // Default limiter cho các domain khác
    this.defaultLimiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 'second',
    });
  }

  private getLimiterForDomain(url: string): RateLimiter {
    for (const [domain, limiter] of this.limiters.entries()) {
      if (url.includes(domain)) {
        return limiter;
      }
    }
    return this.defaultLimiter;
  }

  async waitForToken(url: string): Promise<void> {
    const limiter = this.getLimiterForDomain(url);
    try {
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests < 0) {
        this.logger.debug(`Rate limit reached for ${url}, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      this.logger.error(`Rate limiter error for ${url}:`, error);
      // Fallback delay nếu có lỗi
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
