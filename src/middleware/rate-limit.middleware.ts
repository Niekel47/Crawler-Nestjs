// src/middleware/rate-limit.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../redis/redis.service';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly redisService: RedisService,
    private readonly loggingService: LoggingService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip;
    const endpoint = req.path;
    const key = `ratelimit:crawling:${ip}`;
    const limit = 2; // Giới hạn 2 request mỗi giờ cho việc crawling
    const window = 3600; // Thời gian reset (1 giờ) tính bằng giây

    try {
      const current = (await this.redisService.get<number>(key)) || 0;

      if (current >= limit) {
        this.loggingService.warn(
          `Rate limit exceeded for crawling from IP: ${ip} on ${endpoint}`,
        );
        const remainingTime = await this.redisService.getTTL(key);
        return res.status(429).json({
          message: 'Too many crawling requests, please try again after 1 hour.',
          nextAvailableTime: remainingTime,
        });
      }

      await this.redisService.set(key, current + 1, window);
      next();
    } catch (error) {
      this.loggingService.error('Rate limit error', error.stack);
      next(); // Cho phép request đi tiếp nếu có lỗi với Redis
    }
  }
}
