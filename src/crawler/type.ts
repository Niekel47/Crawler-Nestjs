import { Article } from '../models/article.entity';

export interface ArticlesPaginationResult {
  items: Article[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
