// src/metrics/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { Registry, Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  private static registry: Registry;
  private static crawlCounter: Counter;
  private static crawlDuration: Histogram;

  constructor() {
    if (!MetricsService.registry) {
      MetricsService.registry = new Registry();

      MetricsService.crawlCounter = new Counter({
        name: 'crawler_article_count',
        help: 'Total number of articles crawled',
        labelNames: ['source'],
        registers: [MetricsService.registry],
      });

      MetricsService.crawlDuration = new Histogram({
        name: 'crawler_duration_seconds',
        help: 'Time spent crawling articles',
        labelNames: ['source'],
        registers: [MetricsService.registry],
      });
    }
  }

  incrementCrawlCount(source: string) {
    MetricsService.crawlCounter.labels(source).inc();
  }

  startCrawlTimer(source: string) {
    return MetricsService.crawlDuration.labels(source).startTimer();
  }

  async getMetrics() {
    return await MetricsService.registry.metrics();
  }
}
