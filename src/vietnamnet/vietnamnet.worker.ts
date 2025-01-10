import axios from 'axios';
import * as cheerio from 'cheerio';
import { parentPort, workerData } from 'worker_threads';
import { Article } from '../models/article.entity';
// import * as fs from 'fs';
// import * as path from 'path';
import moment from 'moment';
import { Category } from 'src/models/category.entity';

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export class VietnamnetWorker {
  private axiosInstance;
  private readonly retryDelay = 3000;
  private readonly maxRetries = 3;
  private articleCount = 0;
  private readonly maxArticles = 200;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
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
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          console.log(`Rate limited, waiting ${this.retryDelay}ms...`);
          await delay(this.retryDelay);
          return this.axiosInstance(error.config);
        }
        throw error;
      },
    );
  }

  async startCrawling() {
    try {
      const { articleType, BASE_URL } = workerData;
      console.log(`Starting crawl for category: ${articleType}`);

      const categoryUrl = `${BASE_URL}${articleType}`;
      await this.crawlCategory(categoryUrl);

      console.log(`Completed crawling category: ${articleType}`);
      console.log(`Total articles processed: ${this.articleCount}`);

      if (parentPort) {
        parentPort.postMessage({ type: 'done' });
      }
    } catch (error) {
      console.error('Error in crawl process:', error);
      if (parentPort) {
        parentPort.postMessage({
          type: 'error',
          data: { error: error.message },
        });
      }
    }
  }

  private async crawlCategory(categoryUrl: string) {
    try {
      const response = await this.axiosInstance.get(categoryUrl);
      const $ = cheerio.load(response.data);

      // Get article links from category page
      const articleLinks = $('.vnn-title a')
        .map((_, el) => $(el).attr('href'))
        .get()
        .filter(Boolean)
        .map((url) => {
          if (url.startsWith('/')) {
            return `${workerData.BASE_URL}${url}`;
          }
          return url;
        });

      console.log(`Found ${articleLinks.length} articles in category`);

      // Process each article
      for (const articleUrl of articleLinks) {
        // if (this.articleCount >= this.maxArticles) {
        //   console.log(`Reached maximum articles limit (${this.maxArticles})`);
        //   break;
        // }

        try {
          const article = await this.processArticle(articleUrl);
          if (article) {
            this.articleCount++;
            if (parentPort) {
              parentPort.postMessage({ type: 'article', data: article });
            }
          }
        } catch (error) {
          console.error(
            `Error processing article ${articleUrl}:`,
            error.message,
          );
        }

        // Delay between article processing
        await delay(5000);
      }
    } catch (error) {
      console.error(`Error crawling category ${categoryUrl}:`, error.message);
    }
  }

  private async processArticle(url: string): Promise<Partial<Article> | null> {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const article = await this.extractContent(url);
        console.log(`Successfully processed article: ${article.title}`);
        return article;
      } catch (error) {
        retries++;
        console.error(
          `Error processing article ${url} (attempt ${retries}/${this.maxRetries}):`,
          error.message,
        );
        if (retries < this.maxRetries) {
          await delay(this.retryDelay * retries);
        }
      }
    }
    return null;
  }

  private async extractContent(url: string): Promise<Partial<Article>> {
    const response = await this.axiosInstance.get(url);
    const $ = cheerio.load(response.data);

    const title = $('.content-detail-title').text().trim();
    const description = $('.content-detail-sapo').text().trim();
    const content = $('.maincontent').text().trim();
    const publishDateStr = $('.bread-crumb-detail__time').text().trim();
    const publishDate = this.standardizeDate(publishDateStr);
    const imageUrl = $('.fig-picture img').attr('src');
    const category = url.split('/')[3];

    return {
      title,
      description,
      content,
      publishDate,
      imageUrl,
      category: category as unknown as Category,
      url,
    };
  }

  private standardizeDate(dateString: string): Date {
    const vietnameseMonths = [
      'Tháng 1',
      'Tháng 2',
      'Tháng 3',
      'Tháng 4',
      'Tháng 5',
      'Tháng 6',
      'Tháng 7',
      'Tháng 8',
      'Tháng 9',
      'Tháng 10',
      'Tháng 11',
      'Tháng 12',
    ];

    let standardizedDate = dateString.toLowerCase();
    vietnameseMonths.forEach((month, index) => {
      standardizedDate = standardizedDate.replace(
        month.toLowerCase(),
        (index + 1).toString(),
      );
    });

    const date = moment(standardizedDate, 'HH:mm DD/MM/YYYY');
    return date.isValid() ? date.toDate() : new Date();
  }

  async searchByKeyword(keyword: string, maxPages = 5) {
    try {
      for (let page = 0; page < maxPages; page++) {
        const searchUrl = `${
          workerData.BASE_URL
        }tim-kiem-p${page}?q=${encodeURIComponent(
          keyword,
        )}&od=2&bydaterang=all&newstype=all`;
        const response = await this.axiosInstance.get(searchUrl);
        const $ = cheerio.load(response.data);

        const articles = $('.horizontalPost')
          .map((_, el) => {
            const $item = $(el);
            const title = $item
              .find('.horizontalPost__main-title a')
              .text()
              .trim();
            const url = $item
              .find('.horizontalPost__main-title a')
              .attr('href');
            const thumbnail = $item
              .find('.horizontalPost__avt img')
              .attr('data-srcset');
            const description = $item
              .find('.horizontalPost__main-desc p')
              .text()
              .trim();
            const category = $item
              .find('.horizontalPost__main-cate a')
              .text()
              .trim();

            const similarity = this.calculateRelevance(
              title + ' ' + description,
              keyword,
            );

            if (similarity > 0.3) {
              return {
                title,
                url: url
                  ? url.startsWith('http')
                    ? url
                    : `${workerData.BASE_URL}${url}`
                  : '',
                thumbnail,
                description,
                category,
                similarity,
              };
            }
            return null;
          })
          .get()
          .filter((item) => item !== null);

        if (articles.length > 0) {
          parentPort.postMessage({
            type: 'searchResult',
            data: articles,
          });
        }

        if (articles.length === 0) break;
        await delay(2000);
      }
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        error: error.message,
      });
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
}

// Initialize worker
const worker = new VietnamnetWorker();

// Handle worker messages
if (workerData.mode === 'search') {
  worker.searchByKeyword(workerData.keyword, workerData.maxPages);
} else {
  worker.startCrawling();
}
