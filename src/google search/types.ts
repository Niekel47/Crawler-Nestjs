export interface ArticleDetail {
  url: string;
  content: string;
  images: string[];
  tags: string[];
  author: string | null;
  publishDate: Date | null;
  sentiment: {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  };
}

export interface SearchOptions {
  dateRange?: {
    from: Date;
    to: Date;
  };
  language?: string;
  resultCount?: number;
  sortBy?: 'date' | 'relevance';
}

export interface SearchResult extends Partial<ArticleDetail> {
  title: string;
  snippet: string;
  url: string;
  topics: string[];
  publishDate?: Date | null;
  source?: string;
}
