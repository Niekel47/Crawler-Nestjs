export interface SearchOptions {
  language?: string;
  resultCount?: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
  sortBy?: 'date' | 'relevance';
}

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  topics: string[];
  categories: string[]; // Thêm trường categories
  tags: string[]; // Thêm trường tags
  publishDate: Date | null;
  source: string;
}

export interface ArticleDetail {
  url: string;
  content: string;
  images: string[];
  tags: string[];
  author: string | null;
  publishDate: Date | null;
  sentiment?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  };
}
