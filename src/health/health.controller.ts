// src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private redis: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.http.pingCheck('web-server', 'http://localhost:3000'),
      () => this.db.pingCheck('database'),
      async () => {
        try {
          await this.redis.set('health-check', 'ok');
          await this.redis.get('health-check');
          return { redis: { status: 'up' } };
        } catch (e) {
          console.log(e);
          return { redis: { status: 'down' } };
        }
      },
    ]);
  }
}
