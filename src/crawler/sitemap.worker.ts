import { parentPort, workerData } from 'worker_threads';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import moment from 'moment';
import { Article } from '../models/article.entity';
import { Category } from '../models/category.entity';
import { RateLimiter } from 'limiter';

interface WorkerData {
  url: string;
  mode: 'sitemap';
}

class SitemapWorker {
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
      const { url } = workerData as WorkerData;
      if (!url) {
        throw new Error('Missing required worker data: url');
      }

      console.log(`[SITEMAP] Bắt đầu crawl bài viết: ${url}`);

      let retries = 0;
      let article = null;

      while (retries < this.maxRetries && !article) {
        try {
          article = await this.extractContent(url);
          if (!article) {
            console.log(
              `[RETRY] Thử lại lần ${retries + 1}/${this.maxRetries}`,
            );
            await this.delay(this.retryDelay * (retries + 1));
          }
        } catch (error) {
          console.error(
            `[ERROR] Lỗi khi crawl (lần ${retries + 1}/${this.maxRetries}):`,
            error instanceof Error ? error.message : String(error),
          );
          await this.delay(this.retryDelay * (retries + 1));
        }
        retries++;
      }

      if (article) {
        console.log(`[SITEMAP] Đã crawl thành công bài: ${article.title}`);
        if (parentPort) {
          parentPort.postMessage({ type: 'article', data: article });
        }
      } else {
        console.log(
          `[FAILED] Không thể crawl bài viết sau ${this.maxRetries} lần thử`,
        );
      }

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

  private async extractContent(url: string): Promise<Partial<Article> | null> {
    try {
      console.log(`[EXTRACT] Đang trích xuất nội dung từ: ${url}`);
      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Extract basic article information
      const title = $('.title-detail').first().text().trim();
      const description = $('.description').text().trim();

      // Extract content with better handling of article structure
      const contentElements = $('.fck_detail').find('p, h2, h3');
      const content = contentElements
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((text) => text.length > 0)
        .join('\n\n');

      // Extract and standardize publish date
      const publishDateStr = $('.date').first().text().trim();
      const publishDate = this.standardizeDate(publishDateStr);

      // Extract image with fallbacks
      const imageUrl =
        $('.fig-picture img').attr('data-src') ||
        $('.fig-picture img').attr('src') ||
        $('.content-detail img').first().attr('data-src') ||
        $('.content-detail img').first().attr('src') ||
        '';

      // Extract category from URL
      const urlParts = url.split('/');
      const category = urlParts.length > 3 ? urlParts[3] : 'uncategorized';

      if (!title || !content) {
        console.log(`[SKIP] Bỏ qua bài viết thiếu thông tin cần thiết: ${url}`);
        return null;
      }

      console.log(`[PARSED] Đã parse thành công bài: ${title}`);
      console.log(`[CATEGORY] Category: ${category}`);

      return {
        title,
        url,
        description,
        content,
        publishDate,
        imageUrl,
        source: 'vnexpress.net',
        category: { name: category } as Category,
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
      const cleanDateString = dateString.replace(/\s+/g, ' ').trim();

      // Try different date formats
      const formats = [
        'DD/MM/YYYY HH:mm',
        'HH:mm DD/MM/YYYY',
        'DD/MM HH:mm',
        'DD/MM/YYYY, HH:mm',
        'DD/MM/YYYY',
      ];

      let date = moment(cleanDateString, formats, true);

      // If no format matches, try parsing the string differently
      if (!date.isValid()) {
        // Extract date parts using regex
        const dateMatch = cleanDateString.match(
          /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
        );
        const timeMatch = cleanDateString.match(/(\d{1,2}):(\d{1,2})/);

        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          if (timeMatch) {
            const [, hour, minute] = timeMatch;
            date = moment(
              `${year}-${month}-${day} ${hour}:${minute}`,
              'YYYY-MM-DD HH:mm',
            );
          } else {
            date = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');
          }
        }
      }

      if (date.isValid()) {
        console.log(
          `[DATE] Kết quả chuẩn hóa: ${date.format('YYYY-MM-DD HH:mm:ss')}`,
        );
        return date.toDate();
      }

      console.log('[DATE] Không thể parse ngày, sử dụng ngày hiện tại');
      return new Date();
    } catch (error) {
      console.error(
        '[ERROR] Lỗi chuẩn hóa ngày:',
        error instanceof Error ? error.message : String(error),
      );
      return new Date();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Initialize worker
const worker = new SitemapWorker();
worker.startCrawling();
