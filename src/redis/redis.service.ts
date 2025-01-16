// src/redis/redis.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttl: number = 24 * 60 * 60; // 24 hours in seconds
  private isConnected: boolean = false;

  constructor(
    private configService: ConfigService,
    private readonly logger: LoggingService,
  ) {
    const redisUri = this.configService.get('REDIS_URI');
    this.logger.log(`Initializing Redis connection to ${redisUri}`);

    this.redis = new Redis(redisUri, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 1000, 5000);
        this.logger.warn(
          `Redis connection attempt ${times}, retrying in ${delay}ms`,
        );
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true, // Don't connect immediately
    });

    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.redis.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Redis client connected');
    });

    this.redis.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis client ready');
    });

    this.redis.on('error', (err) => {
      this.isConnected = false;
      this.logger.error('Redis client error', err.stack);
    });

    this.redis.on('close', () => {
      this.isConnected = false;
      this.logger.warn('Redis client disconnected');
    });

    this.redis.on('reconnecting', () => {
      this.logger.warn('Redis client reconnecting');
    });
  }

  async onModuleInit() {
    try {
      await this.redis.connect();
      // Test connection
      await this.redis.ping();
      this.logger.log('Redis connection test successful');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error.stack);
      throw error; // This will prevent the application from starting
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      this.logger.log('Closing Redis connection');
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  async set(key: string, value: any, ttl: number = this.ttl): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
      this.logger.debug(`Successfully set Redis key: ${key}`);
    } catch (error) {
      this.logger.error(`Error setting Redis key: ${key}`, error.stack);
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      this.logger.debug(`Retrieved Redis key: ${key}`);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error(`Error getting Redis key: ${key}`, error.stack);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`Deleted Redis key: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting Redis key: ${key}`, error.stack);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(
        `Error checking Redis key existence: ${key}`,
        error.stack,
      );
      throw error;
    }
  }

  generateKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  // Method to check Redis connection status
  isRedisConnected(): boolean {
    return this.isConnected;
  }

  // Method to test Redis connection
  async testConnection(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis connection test failed', error.stack);
      return false;
    }
  }

  async getTTL(key: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(key);
      return ttl;
    } catch (error) {
      this.logger.error(`Error getting TTL for key: ${key}`, error.stack);
      return 0;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const keys = await this.redis.keys(pattern);
      this.logger.debug(
        `Found ${keys.length} keys matching pattern: ${pattern}`,
      );
      return keys;
    } catch (error) {
      this.logger.error(
        `Error getting keys with pattern: ${pattern}`,
        error.stack,
      );
      return [];
    }
  }
}
