import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from '../models/article.entity';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
    private readonly logger: LoggingService,
  ) {}

  async search(
    query: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: Article[]; total: number }> {
    try {
      const searchQuery = `%${query}%`;
      const [items, total] = await this.articleRepository
        .createQueryBuilder('article')
        .leftJoinAndSelect('article.category', 'category')
        .where('LOWER(article.title) LIKE LOWER(:query)', {
          query: searchQuery,
        })
        .orWhere('LOWER(article.description) LIKE LOWER(:query)', {
          query: searchQuery,
        })
        .orWhere('LOWER(article.content) LIKE LOWER(:query)', {
          query: searchQuery,
        })
        .orderBy('article.publishDate', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { items, total };
    } catch (error) {
      this.logger.error('Search error', error.stack);
      throw error;
    }
  }
}
