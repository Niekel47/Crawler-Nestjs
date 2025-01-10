import { parentPort, workerData } from 'worker_threads';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import moment from 'moment';
import { Article } from '../models/article.entity';
import { Category } from '../models/category.entity';
import { RateLimiter } from 'limiter';
import type { CheerioAPI } from 'cheerio';

interface WorkerData {
  mode: 'search' | 'crawl';
  keyword?: string;
  maxPages?: number;
  articleType?: string;
  BASE_URL?: string;
}

class TuoiTreWorker {
  private axiosInstance: AxiosInstance;
  private readonly retryDelay = 3000;
  private readonly maxRetries = 3;
  private readonly timeout = 30000;
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 3,
      interval: 'second',
    });

    this.axiosInstance = axios.create({
      timeout: this.timeout,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      },
      maxRedirects: 5,
    });

    this.setupAxiosInterceptors();
  }

  private setupAxiosInterceptors() {
    this.axiosInstance.interceptors.request.use(async (config) => {
      await this.rateLimiter.removeTokens(1);
      return config;
    });

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          console.log(`[RATE_LIMIT] Đợi ${this.retryDelay}ms...`);
          await this.delay(this.retryDelay);
          return this.axiosInstance(error.config);
        }
        throw error;
      },
    );
  }

  async startCrawling() {
    try {
      const { articleType, BASE_URL } = workerData as WorkerData;
      if (!articleType || !BASE_URL) {
        throw new Error(
          'Missing required worker data: articleType or BASE_URL',
        );
      }

      console.log(`[START] Bắt đầu crawl chuyên mục: ${articleType}`);
      const categoryUrl = `${BASE_URL}${articleType}.htm`;
      await this.crawlCategory(categoryUrl);
      console.log(`[COMPLETE] Hoàn thành crawl chuyên mục: ${articleType}`);

      if (parentPort) {
        parentPort.postMessage({ type: 'done' });
      }
    } catch (error) {
      console.error('[ERROR] Lỗi trong quá trình crawl:', error);
      if (parentPort) {
        parentPort.postMessage({
          type: 'error',
          data: { error: error.message },
        });
      }
    }
  }

  private async crawlCategory(categoryUrl: string, maxPages = 5) {
    try {
      console.log(`[CRAWLING] Đang crawl chuyên mục: ${categoryUrl}`);

      for (let page = 1; page <= maxPages; page++) {
        const pageUrl =
          page === 1 ? categoryUrl : `${categoryUrl}/trang-${page}.htm`;

        try {
          const response = await this.axiosInstance.get(pageUrl);
          const $ = cheerio.load(response.data);

          const articles = $('.box-category-middle .box-category-item')
            .map((_, element) => this.parseArticle($, element))
            .get()
            .filter((article): article is Partial<Article> => article !== null);

          console.log(
            `[FOUND] Tìm thấy ${articles.length} bài viết trong trang ${page}`,
          );

          for (const article of articles) {
            if (parentPort) {
              console.log(`[SENDING] Gửi dữ liệu bài viết: ${article.title}`);
              parentPort.postMessage({ type: 'article', data: article });
            }
          }

          if (articles.length === 0) {
            console.log(`[END] Không còn bài viết, dừng crawl`);
            break;
          }

          await this.delay(2000);
        } catch (error) {
          console.error(
            `[ERROR] Lỗi crawl trang ${page}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      console.error(
        `[ERROR] Lỗi crawl chuyên mục ${categoryUrl}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private parseArticle($: CheerioAPI, element: any): Partial<Article> | null {
    try {
      const $element = $(element);

      const titleElement = $element.find('.box-title a');
      const title = titleElement.text().trim();
      const url =
        (workerData as WorkerData).BASE_URL + titleElement.attr('href');
      const description = $element.find('.box-content-des').text().trim();
      const dateStr = $element.find('.box-time').text().trim();
      const publishDate = this.standardizeDate(dateStr);
      const imageUrl = $element.find('.img-resize img').attr('src') || '';

      if (!title || !url) {
        console.log(`[SKIP] Bỏ qua bài viết thiếu thông tin cần thiết`);
        return null;
      }

      console.log(`[PARSED] Đã parse thành công bài: ${title}`);

      return {
        title,
        url,
        description,
        content: description,
        publishDate,
        imageUrl,
        source: 'tuoitre.vn',
        category: {
          name: url.split('/')[3]?.replace('.htm', '') || '',
        } as Category,
      };
    } catch (error) {
      console.error(
        '[ERROR] Lỗi parse bài viết:',
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  private standardizeDate(dateString: string): Date {
    try {
      console.log(`[DATE] Chuẩn hóa ngày: ${dateString}`);
      const date = moment(dateString, [
        'DD/MM/YYYY HH:mm',
        'HH:mm DD/MM/YYYY',
        'DD/MM HH:mm',
      ]);

      if (date.isValid()) {
        console.log(
          `[DATE] Kết quả chuẩn hóa: ${date.format('YYYY-MM-DD HH:mm:ss')}`,
        );
        return date.toDate();
      }
      return new Date();
    } catch (error) {
      console.error(
        '[ERROR] Lỗi chuẩn hóa ngày:',
        error instanceof Error ? error.message : String(error),
      );
      return new Date();
    }
  }

  async searchByKeyword(keyword: string, maxPages = 5) {
    try {
      console.log(`[SEARCH] Bắt đầu tìm kiếm với từ khóa: ${keyword}`);

      for (let page = 1; page <= maxPages; page++) {
        console.log(`[SEARCH] Đang tìm kiếm trang ${page}/${maxPages}`);

        const searchUrl = `${(workerData as WorkerData).BASE_URL}tim-kiem.htm?q=${encodeURIComponent(keyword)}&page=${page}`;

        try {
          const response = await this.axiosInstance.get(searchUrl);
          const $ = cheerio.load(response.data);

          const articles = $('.box-search-result .box-category-item')
            .map((_, element) => {
              const article = this.parseArticle($, element);
              if (article) {
                const similarity = this.calculateRelevance(
                  article.title + ' ' + article.description,
                  keyword,
                );
                if (similarity > 0.3) {
                  console.log(
                    `[MATCH] Tìm thấy bài viết phù hợp: ${article.title} (độ tương đồng: ${similarity})`,
                  );
                  return { ...article, similarity };
                }
                console.log(
                  `[SKIP] Bỏ qua bài viết do độ tương đồng thấp: ${article.title}`,
                );
              }
              return null;
            })
            .get()
            .filter(
              (article): article is Partial<Article> & { similarity: number } =>
                article !== null,
            );

          if (articles.length > 0) {
            console.log(
              `[FOUND] Tìm thấy ${articles.length} bài viết phù hợp trên trang ${page}`,
            );
            if (parentPort) {
              parentPort.postMessage({
                type: 'searchResult',
                data: articles,
              });
            }
          }

          if (articles.length === 0) {
            console.log(`[END] Không còn kết quả phù hợp, dừng tìm kiếm`);
            break;
          }

          console.log(`[DELAY] Đợi 2 giây trước khi tìm trang tiếp theo`);
          await this.delay(2000);
        } catch (error) {
          console.error(
            '[SEARCH_ERROR] Lỗi trong quá trình tìm kiếm:',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private calculateRelevance(text: string, keyword: string): number {
    const normalizedText = text.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();

    if (normalizedText.includes(normalizedKeyword)) return 1;

    const words = normalizedText.split(/\s+/);
    const keywordWords = normalizedKeyword.split(/\s+/);
    let matches = 0;

    keywordWords.forEach((kw) => {
      if (words.some((w) => w.includes(kw))) matches++;
    });

    return matches / keywordWords.length;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize worker
const worker = new TuoiTreWorker();
const typedWorkerData = workerData as WorkerData;

// Handle worker messages
if (typedWorkerData.mode === 'search' && typedWorkerData.keyword) {
  worker.searchByKeyword(typedWorkerData.keyword, typedWorkerData.maxPages);
} else if (typedWorkerData.mode === 'crawl') {
  worker.startCrawling();
} else {
  throw new Error('Invalid worker mode or missing required data');
}
