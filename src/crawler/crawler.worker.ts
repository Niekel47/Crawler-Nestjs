import { parentPort, workerData } from 'worker_threads';
import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import moment from 'moment';
import * as fs from 'fs';
import { Article } from '../models/article.entity';
import { ContentProcessorService } from '../utils/content-processor.service';
import { ContentAnalyzerService } from '../content_analyzer/content_analyzer.service';
import { ConfigService } from '@nestjs/config';
import { LoggingService } from '../logging/logging.service';
import { Category } from 'src/models/category.entity';
import { RateLimiter } from 'limiter';

interface WorkerData {
  mode: 'search' | 'crawl';
  keyword?: string;
  maxPages?: number;
  articleType?: string;
  BASE_URL?: string;
}

interface ArticleAnalysis {
  title: string;
  url: string;
  description: string;
  publishDate: Date;
  category: string;
  imageUrl: string;
  content: string;
  summary: {
    summary: string;
    topics: string[];
    score: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    categories?: string[];
    keywords?: string[];
  };
}

class CrawlerWorker {
  private axiosInstance: AxiosInstance;
  private readonly retryDelay = 5000;
  private readonly maxRetries = 5;
  private readonly timeout = 60000;
  private readonly contentProcessor: ContentProcessorService;
  private readonly contentAnalyzer: ContentAnalyzerService;
  private readonly logger: LoggingService;
  private rateLimiter: RateLimiter;

  constructor() {
    this.logger = new LoggingService();
    const configService = new ConfigService();
    this.contentProcessor = new ContentProcessorService(configService);
    this.contentAnalyzer = new ContentAnalyzerService(
      configService,
      this.logger,
    );
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 3,
      interval: 'second',
    });
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      withCredentials: true,
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
        if (
          error.response?.status === 429 ||
          error.code === 'ERR_FR_TOO_MANY_REDIRECTS'
        ) {
          const delay = this.retryDelay * (error.config.__retryCount || 1);
          error.config.__retryCount = (error.config.__retryCount || 0) + 1;

          if (error.config.__retryCount <= this.maxRetries) {
            console.log(`Retrying request after ${delay}ms delay...`);
            await this.delay(delay);
            return this.axiosInstance(error.config);
          }
        }
        throw error;
      },
    );
  }

  private async readExistingAnalysis(
    filePath: string,
  ): Promise<ArticleAnalysis[]> {
    try {
      if (fs.existsSync(filePath)) {
        const data = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      this.logger.error(
        'Error reading analysis file:',
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  private async updateOrCreateAnalysis(
    articles: Partial<Article>[],
    filePath: string,
  ): Promise<void> {
    try {
      const existingAnalysis = await this.readExistingAnalysis(filePath);
      const existingUrls = new Set(
        existingAnalysis.map((article) => article.url),
      );
      const newAnalysis: ArticleAnalysis[] = [];

      for (const article of articles) {
        if (existingUrls.has(article.url)) {
          continue;
        }

        try {
          const analysisResult = await this.processArticleWithAnalysis(article);
          newAnalysis.push(analysisResult);
          await this.delay(1000);
        } catch (error) {
          this.logger.error(
            `Error analyzing article ${article.url}:`,
            error instanceof Error ? error.stack : String(error),
          );
          // Fallback khi có lỗi phân tích
          newAnalysis.push(this.createBasicAnalysis(article));
        }
      }

      const updatedAnalysis = [...existingAnalysis, ...newAnalysis];
      updatedAnalysis.sort(
        (a, b) =>
          new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime(),
      );

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(updatedAnalysis, null, 2),
        'utf8',
      );

      this.logger.log(
        `Analysis updated: ${newAnalysis.length} new articles added to ${filePath}`,
      );
    } catch (error) {
      this.logger.error(
        'Error updating analysis:',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private createBasicAnalysis(article: Partial<Article>): ArticleAnalysis {
    return {
      title: article.title || '',
      url: article.url || '',
      description: article.description || '',
      publishDate: article.publishDate || new Date(),
      category:
        typeof article.category === 'string'
          ? article.category
          : article.category?.name || 'Uncategorized',
      imageUrl: article.imageUrl || '',
      content: article.content || '',
      summary: {
        summary: article.description || '',
        topics: [],
        score: 0,
        sentiment: 'neutral',
        categories: ['Uncategorized'],
        keywords: [],
      },
    };
  }

  private async extractAndSaveContent(url: string): Promise<Partial<Article>> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const article = await this.extractContent(url);
        article.content = this.contentProcessor.cleanHtml(article.content);
        return article;
      } catch (error) {
        retries++;
        this.logger.error(
          `Error processing article ${url} (attempt ${retries}/${this.maxRetries}):`,
          error instanceof Error ? error.stack : String(error),
        );
        if (retries === this.maxRetries) throw error;
        await this.delay(this.retryDelay * retries);
      }
    }
    throw new Error(
      `Failed to process article after ${this.maxRetries} attempts`,
    );
  }

  private async extractContent(url: string): Promise<Partial<Article>> {
    const { data } = await this.axiosInstance.get(url);
    const $ = cheerio.load(data);

    const title =
      $('h1.title-detail').first().text().trim() ||
      $('h1.title-post').first().text().trim() ||
      $('h1.title_news_detail').first().text().trim() ||
      $('.title_news_detail h1').first().text().trim() ||
      $('.title-detail').first().text().trim();

    const description =
      $('p.description').text().trim() ||
      $('.description').text().trim() ||
      $('.sapo').text().trim();

    const content = $('p.Normal, .fck_detail p.Normal')
      .map((_, el) => $(el).text())
      .get()
      .join('\n')
      .trim();

    const publishDate =
      $('.header-content .date').first().text().trim() ||
      $('.time').first().text().trim() ||
      $('.date').first().text().trim();

    const categoryName =
      $('.breadcrumb li:last-child a').text().trim() ||
      $('.parent-cate').text().trim();

    const imageUrl =
      $('.fig-picture img').attr('data-src') ||
      $('.fig-picture img').attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      $('.block_thumb_slide_show img').attr('src');

    return {
      title,
      description,
      content,
      url,
      publishDate: this.standardizeDate(publishDate),
      category: { name: categoryName } as Category,
      imageUrl,
    };
  }

  private standardizeDate(dateString: string): Date {
    try {
      moment.locale('vi');
      const date = moment(dateString, [
        'DD/MM/YYYY, HH:mm',
        'HH:mm DD/MM/YYYY',
        'dddd, DD/MM/YYYY, HH:mm (Z)',
      ]);
      return date.isValid() ? date.toDate() : new Date();
    } catch (error) {
      this.logger.error(
        'Error standardizing date',
        error instanceof Error ? error.stack : String(error),
      );
      return new Date();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async analyzeAndSaveArticles(
    articles: Partial<Article>[],
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = `analyzed_articles_${timestamp}.json`;
      await this.updateOrCreateAnalysis(articles, filePath);
    } catch (error) {
      this.logger.error(
        'Error analyzing and saving articles:',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async crawlArticleType(maxPages = 5): Promise<void> {
    const crawledArticles: Partial<Article>[] = [];

    try {
      for (let page = 1; page <= maxPages; page++) {
        try {
          const urls = await this.getUrlsOfTypeThread(page);
          if (urls.length === 0) {
            this.logger.log(`No URLs found on page ${page}, stopping crawl`);
            break;
          }

          const results = await Promise.allSettled(
            urls.map((url) => this.extractAndSaveContent(url)),
          );

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              const article = result.value;
              crawledArticles.push(article);

              try {
                const analysisResult =
                  await this.processArticleWithAnalysis(article);
                if (parentPort) {
                  parentPort.postMessage({
                    type: 'article',
                    data: {
                      ...article,
                      analysis: analysisResult.summary,
                    },
                  });
                }
              } catch (error) {
                this.logger.error(
                  `Error processing article analysis: ${article.url}`,
                  error instanceof Error ? error.stack : String(error),
                );
                // Fallback khi có lỗi phân tích
                if (parentPort) {
                  parentPort.postMessage({
                    type: 'article',
                    data: {
                      ...article,
                      analysis: this.createBasicAnalysis(article).summary,
                    },
                  });
                }
              }
            }
          }

          await this.delay(3000);
        } catch (error) {
          this.logger.error(
            `Error processing page ${page}:`,
            error instanceof Error ? error.stack : String(error),
          );
          if (
            error instanceof Error &&
            (error.message.includes('ETIMEDOUT') ||
              error.message.includes('ECONNABORTED'))
          ) {
            await this.delay(this.retryDelay);
            page--;
            continue;
          }
        }
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = `analyzed_articles_${timestamp}.json`;
      await this.updateOrCreateAnalysis(crawledArticles, filePath);

      if (parentPort) {
        parentPort.postMessage({ type: 'done' });
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: 'error',
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private async getUrlsOfTypeThread(pageNumber: number): Promise<string[]> {
    const { articleType, BASE_URL } = workerData as WorkerData;
    if (!articleType || !BASE_URL) {
      throw new Error('Missing required worker data: articleType or BASE_URL');
    }

    const pageUrl = `${BASE_URL}${articleType}-p${pageNumber}`;
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const { data } = await this.axiosInstance.get(pageUrl);
        const $ = cheerio.load(data);
        const titles = $('.title-news');

        const urls = titles
          .map((_, element) => $(element).find('a').attr('href'))
          .get()
          .filter((url): url is string => typeof url === 'string');

        if (urls.length === 0) {
          this.logger.warn(`No URLs found at ${pageUrl}`);
        }

        return urls;
      } catch (error) {
        retries++;
        this.logger.error(
          `Error fetching URLs from ${pageUrl} (attempt ${retries}/${this.maxRetries}):`,
          error instanceof Error ? error.stack : String(error),
        );
        if (retries === this.maxRetries) {
          this.logger.error(`Max retries reached for ${pageUrl}`);
          return [];
        }
        await this.delay(this.retryDelay * retries);
      }
    }
    return [];
  }

  private async searchPage(
    keyword: string,
    page: number,
  ): Promise<Partial<Article>[]> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const searchUrl = `https://timkiem.vnexpress.net/?q=${encodeURIComponent(
          keyword,
        )}&page=${page}`;

        const { data } = await this.axiosInstance.get(searchUrl);
        const $ = cheerio.load(data);

        const searchResults = await Promise.all(
          $('.item-news')
            .map(async (_, element) => {
              const $element = $(element);
              const title = $element.find('.title-news a').text().trim();
              const url = $element.find('.title-news a').attr('href');
              const description = $element.find('.description').text().trim();
              const publishDate = $element.find('.time-public').text().trim();
              const categoryName = $element
                .find('.cat-time .cat')
                .text()
                .trim();
              const imageUrl =
                $element.find('img.lazy').attr('data-src') ||
                $element.find('img.lazy').attr('src');

              if (!title || !url) return null;

              try {
                const fullArticle = await this.extractContent(url);
                if (!fullArticle.content) return null;

                return {
                  title,
                  url,
                  description: description || '',
                  publishDate: this.standardizeDate(publishDate),
                  category: { name: categoryName } as Category,
                  imageUrl: imageUrl || '',
                  content: fullArticle.content,
                  summary: '',
                } as Partial<Article>;
              } catch (error) {
                this.logger.error(
                  `Error extracting content for ${url}:`,
                  error instanceof Error ? error.stack : String(error),
                );
                return null;
              }
            })
            .get(),
        );

        return searchResults.filter((result): result is Partial<Article> => {
          if (!result) return false;
          return (
            typeof result.title === 'string' &&
            typeof result.url === 'string' &&
            result.content !== undefined &&
            result.category !== undefined
          );
        });
      } catch (error) {
        retries++;
        this.logger.error(
          `Error in search page (attempt ${retries}/${this.maxRetries}):`,
          error instanceof Error ? error.stack : String(error),
        );
        if (retries === this.maxRetries) throw error;
        await this.delay(this.retryDelay * retries);
      }
    }
    return [];
  }

  async searchByKeyword(keyword: string, maxPages = 5): Promise<void> {
    try {
      const searchResults: Partial<Article>[] = [];
      let consecutiveEmptyPages = 0;

      for (let page = 1; page <= maxPages; page++) {
        try {
          const results = await this.searchPage(keyword, page);
          if (results.length === 0) {
            consecutiveEmptyPages++;
            if (consecutiveEmptyPages >= 2) break;
          } else {
            consecutiveEmptyPages = 0;
            searchResults.push(...results);
          }
          await this.delay(2000);
        } catch (error) {
          this.logger.error(
            `Error searching page ${page}:`,
            error instanceof Error ? error.stack : String(error),
          );
          if (
            error instanceof Error &&
            (error.message.includes('ETIMEDOUT') ||
              error.message.includes('ECONNABORTED'))
          ) {
            await this.delay(this.retryDelay);
            page--;
            continue;
          }
        }
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = `analyzed_articles_${timestamp}.json`;

      await this.updateOrCreateAnalysis(searchResults, filePath);

      if (parentPort) {
        parentPort.postMessage({
          type: 'searchResult',
          data: searchResults,
        });
      }
    } catch (error) {
      if (parentPort) {
        parentPort.postMessage({
          type: 'error',
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  }

  private async processArticleWithAnalysis(
    article: Partial<Article>,
  ): Promise<ArticleAnalysis> {
    try {
      const analysis = await this.contentAnalyzer.analyzeContent(
        article.content,
        typeof article.category === 'string'
          ? article.category
          : article.category?.name || '',
      );

      return {
        title: article.title,
        url: article.url,
        description: article.description,
        publishDate: article.publishDate,
        category:
          typeof article.category === 'string'
            ? article.category
            : article.category?.name || '',
        imageUrl: article.imageUrl,
        content: article.content,
        summary: {
          summary: analysis.summary,
          topics: analysis.topics,
          score: analysis.score,
          sentiment: analysis.sentiment,
          categories: analysis.categories,
          keywords: analysis.keywords,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing article ${article.url}:`,
        error instanceof Error ? error.stack : String(error),
      );
      // Fallback khi có lỗi phân tích
      return this.createBasicAnalysis(article);
    }
  }
}

// Initialize worker
const worker = new CrawlerWorker();
const typedWorkerData = workerData as WorkerData;

// Handle worker messages
if (typedWorkerData.mode === 'search' && typedWorkerData.keyword) {
  worker.searchByKeyword(typedWorkerData.keyword, typedWorkerData.maxPages);
} else if (typedWorkerData.mode === 'crawl') {
  worker.crawlArticleType(typedWorkerData.maxPages).then(() => {
    if (parentPort) {
      parentPort.postMessage({ type: 'done' });
    }
  });
} else {
  throw new Error('Invalid worker mode or missing required data');
}
