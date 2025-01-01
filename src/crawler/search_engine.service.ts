import { Injectable } from '@nestjs/common';
import { WebGraphCrawlerService } from './web-graph.crawler';

interface PageInfo {
  page: string;
  word: string;
  count: number;
}

export interface PageWeight {
  words: string[];
  weight: number;
  page: string;
  page_name: string;
}

@Injectable()
export class SearchWithPageRankService {
  constructor(private readonly webGraphService: WebGraphCrawlerService) {}

  private calculateWeightage(
    pagesList: PageInfo[],
    ranks: { [key: string]: number },
    urlPageTitleMap: { [key: string]: string },
  ): PageWeight[] {
    const pageWeight: { [key: string]: PageWeight } = {};
    const titleBoost = 2.0; // Boost cho từ khóa xuất hiện trong title
    const urlBoost = 1.5; // Boost cho từ khóa xuất hiện trong URL
    const mainContentBoost = 1.2; // Boost cho các trang chính

    for (const pageInfo of pagesList) {
      try {
        const { page, word, count } = pageInfo;
        const title = urlPageTitleMap[page] || '';

        if (!pageWeight[page]) {
          pageWeight[page] = {
            words: [],
            weight: 0,
            page,
            page_name: title,
          };
        }

        // Cộng điểm cơ bản từ PageRank và số lần xuất hiện
        let wordWeight = count * (ranks[page] || 1);

        // Boost nếu từ khóa xuất hiện trong title
        if (title.toLowerCase().includes(word.toLowerCase())) {
          wordWeight *= titleBoost;
        }

        // Boost nếu từ khóa xuất hiện trong URL
        if (page.toLowerCase().includes(word.toLowerCase())) {
          wordWeight *= urlBoost;
        }

        // Boost cho các trang chính
        if (
          page.endsWith('.htm') ||
          page.endsWith('/') ||
          page.includes('/tin-tuc/') ||
          page.includes('/thoi-su/') ||
          page.includes('/xa-hoi/')
        ) {
          wordWeight *= mainContentBoost;
        }

        // Loại bỏ các trang không liên quan
        if (
          page.includes('/dang-ky') ||
          page.includes('/dang-nhap') ||
          page.includes('sso.') ||
          page.includes('/order') ||
          page.includes('/quangcao') ||
          page.includes('/bookmarked') ||
          page.includes('/commented') ||
          page.includes('/transactions')
        ) {
          wordWeight = 0;
        }

        pageWeight[page].words.push(word);
        pageWeight[page].weight += wordWeight;
      } catch (error) {
        console.error('Error calculating weightage:', error);
        continue;
      }
    }

    // Convert to array and sort by weight
    const result = Object.values(pageWeight)
      .filter((page) => page.weight > 0) // Chỉ giữ lại các trang có weight > 0
      .sort((a, b) => b.weight - a.weight);

    return result;
  }

  public search(
    query: string,
    indexed: {
      [key: string]: {
        pages: Set<string>;
        [url: string]: number | Set<string>;
      };
    },
    ranks: { [key: string]: number },
    urlPageTitleMap: { [key: string]: string },
  ): PageWeight[] {
    if (!query || !indexed || !ranks || !urlPageTitleMap) {
      return [];
    }

    // Clean and tokenize the query
    const cleanedQuery = this.webGraphService.getCleanedContent(query);
    if (!cleanedQuery || cleanedQuery.length === 0) {
      return [];
    }

    const result: PageInfo[] = [];

    // Process each word in the query
    for (const word of cleanedQuery) {
      if (word in indexed) {
        const pages = indexed[word].pages;

        for (const page of pages) {
          const count = indexed[word][page];
          if (typeof count === 'number') {
            result.push({
              page,
              word,
              count,
            });
          }
        }
      }
    }

    return this.calculateWeightage(result, ranks, urlPageTitleMap);
  }
}
