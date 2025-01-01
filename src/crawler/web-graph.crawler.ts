import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CheerioAPI, load } from 'cheerio';
import { Element } from 'domhandler';
import * as https from 'https';
import { LoggingService } from '../logging/logging.service';
import { RateLimiter } from 'limiter';
import { ConfigService } from '@nestjs/config';
import { eng } from 'stopword';

export interface Node {
  name: string;
}

export interface Link {
  source: string;
  target: string;
}

export interface CrawlingResult {
  nodes: Node[];
  links: Link[];
}

export interface CrawlResult {
  crawling_result: CrawlingResult;
  indexed: {
    [key: string]: {
      pages: Set<string>;
      [url: string]: number | Set<string>;
    };
  };
  url_page_title_map: {
    [url: string]: string;
  };
}

@Injectable()
export class WebGraphCrawlerService {
  private axiosInstance: AxiosInstance;
  private readonly retryDelay = 5000;
  private readonly maxRetries = 3;
  private readonly timeout = 30000;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: LoggingService;

  // Danh sách các từ ghép có nghĩa cần giữ lại
  private readonly compoundWords = [
    'xã hội',
    'thời sự',
    'kinh tế',
    'giáo dục',
    'chính trị',
    'văn hóa',
    'thể thao',
    'công nghệ',
    'du lịch',
    'sức khỏe',
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly loggingService: LoggingService,
  ) {
    this.logger = loggingService;
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 3,
      interval: 'second',
    });

    // Create axios instance with SSL configuration
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      maxRedirects: 5,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
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
          const delay = this.retryDelay * (error.config.__retryCount || 1);
          error.config.__retryCount = (error.config.__retryCount || 0) + 1;

          if (error.config.__retryCount <= this.maxRetries) {
            this.logger.log(`Retrying request after ${delay}ms delay...`);
            await this.delay(delay);
            return this.axiosInstance(error.config);
          }
        }
        throw error;
      },
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private returnContent($: CheerioAPI, elements: Element[]): string[] {
    const content: string[] = [];
    const wordsSet = new Set<string>();

    for (const element of elements) {
      const text = $(element).text();

      // Kiểm tra từ ghép trước
      for (const compound of this.compoundWords) {
        if (text.toLowerCase().includes(compound)) {
          if (!wordsSet.has(compound)) {
            content.push(compound);
            wordsSet.add(compound);
          }
        }
      }

      // Sau đó xử lý các từ đơn
      const words = text.split(/\s+/);
      for (const word of words) {
        const lowerWord = word.toLowerCase();
        if (
          !wordsSet.has(lowerWord) &&
          !this.compoundWords.some((c) => lowerWord.includes(c))
        ) {
          content.push(lowerWord);
          wordsSet.add(lowerWord);
        }
      }
    }

    return content;
  }

  public getCleanedContent(content: string): string[] {
    if (!content) return [];

    // Kiểm tra từ ghép trước
    const result: string[] = [];
    const lowerContent = content.toLowerCase();

    for (const compound of this.compoundWords) {
      if (lowerContent.includes(compound)) {
        result.push(compound);
      }
    }

    // Nếu không có từ ghép, xử lý như từ đơn
    if (result.length === 0) {
      // Giữ nguyên dấu tiếng Việt, chỉ loại bỏ các ký tự đặc biệt
      const noPunctuation = content.replace(/[!@#$%^&*(),.?":{}|<>]/g, ' ');

      // Split thành các từ, giữ nguyên chữ hoa/thường và dấu
      const words = noPunctuation
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => word.toLowerCase());

      // Loại bỏ stopwords
      result.push(
        ...words.filter((word) => !eng.includes(word) && word.trim() !== ''),
      );
    }

    return result;
  }

  private createNodes(crawledUrl: string[]): Node[] {
    return crawledUrl.map((url) => ({ name: url }));
  }

  private createLinks(fromToUrls: [string, string][]): Link[] {
    return fromToUrls.map(([source, target]) => ({ source, target }));
  }

  private createJson(
    crawledUrl: string[],
    fromToUrls: [string, string][],
  ): CrawlingResult {
    const nodes = this.createNodes(crawledUrl);
    const links = this.createLinks(fromToUrls);
    return { nodes, links };
  }

  private updateUniqueUrl(
    url: string,
    allUniqueUrls: string[],
    allUniqueUrlsSet: Set<string>,
    crawledUrlIndex: { [key: string]: number },
  ): [string[], Set<string>, { [key: string]: number }] {
    if (!allUniqueUrlsSet.has(url)) {
      crawledUrlIndex[url] = allUniqueUrlsSet.size;
      allUniqueUrlsSet.add(url);
      allUniqueUrls.push(url);
    }
    return [allUniqueUrls, allUniqueUrlsSet, crawledUrlIndex];
  }

  private updateIndexed(
    indexed: CrawlResult['indexed'],
    word: string,
    url: string,
  ): void {
    if (!indexed[word]) {
      indexed[word] = { pages: new Set() };
    }
    if (!indexed[word][url]) {
      indexed[word].pages.add(url);
      indexed[word][url] = 0;
    }
    (indexed[word][url] as number)++;
  }

  async webCrawl(
    seedUrl: string,
    maxIteration = 3,
    maxPages = 50,
  ): Promise<CrawlResult> {
    let maxPagesCollect = maxPages;
    let toCrawlUrl: string[] = [seedUrl];
    const crawledUrl: string[] = [];
    let crawledUrlIndex: { [key: string]: number } = {};
    const indexed: CrawlResult['indexed'] = {};
    const crawledUrlSet = new Set<string>();
    const toCrawlUrlSet = new Set<string>([seedUrl]);
    const fromToUrls: [string, string][] = [];
    let allUniqueUrls: string[] = [];
    let allUniqueUrlsSet = new Set<string>();
    const urlPageTitleMap: { [url: string]: string } = {};

    while (toCrawlUrl.length > 0 && maxIteration > 0) {
      maxIteration--;
      let currLen = toCrawlUrl.length;

      if (maxPagesCollect <= 0) {
        break;
      }

      while (currLen > 0) {
        if (maxPagesCollect <= 0) {
          break;
        }
        maxPagesCollect--;
        currLen--;

        const urlToVisit = toCrawlUrl[0];
        toCrawlUrlSet.delete(urlToVisit);
        toCrawlUrl = toCrawlUrl.slice(1);

        let result = this.updateUniqueUrl(
          urlToVisit,
          allUniqueUrls,
          allUniqueUrlsSet,
          crawledUrlIndex,
        );
        allUniqueUrls = result[0];
        allUniqueUrlsSet = result[1];
        crawledUrlIndex = result[2];

        this.logger.log(`Going to: ${urlToVisit}`);

        try {
          const { data } = await this.axiosInstance.get(urlToVisit);
          const $ = load(data);

          // Extract URLs
          const urls = new Set<string>();
          $('a[href^="https://"]').each((_, element) => {
            const href = $(element).attr('href');
            if (href) {
              urls.add(href);
            }
          });

          const title = $('title').text();
          urlPageTitleMap[urlToVisit] = title;

          const body = $('body').toArray();
          const content = this.returnContent($, body);
          const cleanedContent = this.getCleanedContent(content.join(' '));

          // Keyword to URL mapping
          for (const word of cleanedContent) {
            this.updateIndexed(indexed, word, urlToVisit);
          }

          // Adding new URLs
          for (const url of urls) {
            if (toCrawlUrlSet.has(url) || crawledUrlSet.has(url)) {
              continue;
            }
            toCrawlUrl.push(url);
            toCrawlUrlSet.add(url);
            fromToUrls.push([urlToVisit, url]);

            result = this.updateUniqueUrl(
              url,
              allUniqueUrls,
              allUniqueUrlsSet,
              crawledUrlIndex,
            );
            allUniqueUrls = result[0];
            allUniqueUrlsSet = result[1];
            crawledUrlIndex = result[2];
          }

          crawledUrlIndex[urlToVisit] = crawledUrl.length;
          crawledUrl.push(urlToVisit);
          crawledUrlSet.add(urlToVisit);

          await this.delay(1000); // Rate limiting
        } catch (error) {
          this.logger.error(
            `Error processing ${urlToVisit}:`,
            error instanceof Error ? error.stack : String(error),
          );
          continue;
        }
      }
    }

    this.logger.log('Crawling complete');

    const crawlingResult = this.createJson(allUniqueUrls, fromToUrls);
    return {
      crawling_result: crawlingResult,
      indexed,
      url_page_title_map: urlPageTitleMap,
    };
  }
}
