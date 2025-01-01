// src/metrics/metrics.module.ts
import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  providers: [
    {
      provide: MetricsService,
      useFactory: () => {
        return new MetricsService();
      },
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
