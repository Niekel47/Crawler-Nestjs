import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebCrawlerService } from './crawler/crawler.service';
import { VietnamnetService } from './vietnamnet/vietnamnet.service';
import { TwentyFourHService } from './24h.com/24h.service';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService } from './openai.service';
// import { TuoiTreService } from './tuoitre/tuoitre.service';
// import { ArticlesPaginationResult } from './crawler/type';
import Bottleneck from 'bottleneck';
import { LoggingService } from './logging/logging.service';
import { Article } from './models/article.entity';
import { ContentAnalyzerService } from './content_analyzer/content_analyzer.service';

interface AnalyzedArticle {
  title: string;
  url: string;
  description: string;
  publishDate: Date;
  imageUrl: string;
  source: string;
  analysis: {
    summary: string;
    topics: string[];
    score: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    categories: string[];
    keywords: string[];
  };
}

interface CrawlResults {
  [category: string]: AnalyzedArticle[];
}

@Injectable()
export class CrawlerManagerService implements OnModuleInit {
  private crawlResults: CrawlResults = {};
  private isRunning: boolean = false;
  private limiter: Bottleneck;

  constructor(
    private vietnamNetCrawlerService: VietnamnetService,
    private webCrawlerService: WebCrawlerService,
    private twentyFourHService: TwentyFourHService,
    // private tuoitreService: TuoiTreService,
    private openAIService: OpenAIService,
    private readonly logger: LoggingService,
    private readonly contentAnalyzerService: ContentAnalyzerService,
  ) {
    this.logger = new LoggingService();
    // Khởi tạo bottleneck limiter
    this.limiter = new Bottleneck({
      maxConcurrent: 1, // Số request đồng thời tối đa
      minTime: 3000, // Thời gian tối thiểu giữa các request (ms)
      reservoir: 1, // Số request tối đa trong một khoảng thời gian
      reservoirRefreshAmount: 1, // Số request được refresh
      reservoirRefreshInterval: 60 * 1000, // Thời gian refresh reservoir (60 giây)
    });

    // Thêm event listeners để theo dõi limiter
    this.limiter.on('failed', async (error, jobInfo) => {
      console.warn(`Job ${jobInfo.options.id} failed: ${error}`);
      if (jobInfo.retryCount < 3) {
        // Retry tối đa 3 lần
        console.log(`Retrying job ${jobInfo.options.id}`);
        return 3000; // Đợi 3 giây trước khi retry
      }
    });

    this.limiter.on('depleted', () => {
      console.warn('Rate limit depleted, waiting for refresh...');
    });
  }

  onModuleInit() {
    this.startCrawling();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledCrawling() {
    console.log('Bắt đầu crawl theo lịch...');
    await this.startCrawling();
  }

  private async startCrawling() {
    if (this.isRunning) {
      console.log('Crawling is already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Bắt đầu crawl...');

    try {
      await Promise.all([
        this.vietnamNetCrawlerService.startCrawling(),
        // this.webCrawlerService.startCrawling(),
        // this.twentyFourHService.startCrawling(),
        // this.tuoitreService.startCrawling(),
      ]);
      // await this.processAndSaveResults();
      // const crawlPromises = [
      //   this.vietnamNetCrawlerService.startCrawling(),
      //   this.webCrawlerService.startCrawling(),
      //   // Thêm các nguồn crawl mới ở đây
      // ];
      // const crawlResults = await Promise.all(crawlPromises);
      // // 2. Gộp kết quả crawl
      // const allArticles = this.mergeArticles(crawlResults);
      // // 3. Phân tích nội dung
      // await this.analyzeArticles(allArticles);
      // // 4. Lưu kết quả
      // await this.saveCrawlResults();
    } catch (error) {
      console.error('Error during crawling:', error);
    } finally {
      this.isRunning = false;
      console.log('Crawl hoàn tất');
    }
  }

  // private async processAndSaveResults() {
  //   try {
  //     // 1. Crawl tất cả bài viết trước
  //     console.log('Bắt đầu crawl bài viết...');
  //     const allArticles: ArticlesPaginationResult = await this.getAllArticles();
  //     console.log(`Đã crawl xong ${allArticles.data.length} bài viết`);

  //     // 2. Xử lý từng bài viết một cách tuần tự
  //     console.log('Bắt đầu phân tích bài viết...');
  //     for (const article of allArticles.data) {
  //       try {
  //         console.log(`Đang phân tích bài viết: ${article.title}`);

  //         // Xử lý summary trước
  //         const summary = await this.limiter.schedule(() =>
  //           this.openAIService.summarizeArticle(article.content),
  //         );

  //         // Sau đó xử lý analysis
  //         const analysis = await this.limiter.schedule(() =>
  //           this.openAIService.analyzeArticle(article.content),
  //         );

  //         const categoryName = article.category?.name || 'uncategorized';

  //         if (!this.crawlResults[categoryName]) {
  //           this.crawlResults[categoryName] = [];
  //         }

  //         this.crawlResults[categoryName].push({
  //           title: article.title,
  //           link: article.url,
  //           summary,
  //           score: analysis.score,
  //           term: categoryName,
  //           date: article.publishDate,
  //         });

  //         console.log(`Hoàn thành phân tích: ${article.title}`);
  //       } catch (error) {
  //         console.error(`Lỗi khi phân tích bài viết ${article.title}:`, error);
  //         if (error.response) {
  //           console.error('OpenAI API Error:', {
  //             status: error.response.status,
  //             data: error.response.data,
  //           });
  //         }

  //         // Thêm bài viết vào kết quả với thông tin lỗi
  //         const categoryName = article.category?.name || 'uncategorized';
  //         if (!this.crawlResults[categoryName]) {
  //           this.crawlResults[categoryName] = [];
  //         }

  //         this.crawlResults[categoryName].push({
  //           title: article.title,
  //           link: article.url,
  //           summary: 'Error generating summary',
  //           score: 0,
  //           term: categoryName,
  //           date: article.publishDate,
  //         });
  //       }
  //     }

  //     console.log('Hoàn thành phân tích tất cả bài viết');
  //     this.saveCrawlResults();
  //   } catch (error) {
  //     console.error('Lỗi trong quá trình xử lý:', error);
  //   }
  // }

  // private async getAllArticles() {
  //   // const vietnamnetArticles = await this.vietnamNetCrawlerService.getArticles();
  //   const webCrawlerArticles = await this.webCrawlerService.getArticles();
  //   // const twentyFourHArticles = await this.twentyFourHService.getArticles();

  //   return webCrawlerArticles;
  // }

  // private saveCrawlResults() {
  //   try {
  //     const filePath = path.join(__dirname, '..', '..', 'crawled_results.json');
  //     fs.writeFileSync(filePath, JSON.stringify(this.crawlResults, null, 2));
  //     console.log('Crawl results saved to file');
  //   } catch (error) {
  //     console.error('Error saving crawl results:', error);
  //   }
  // }

  // async cleanupOldData() {
  //   const oneMonthAgo = new Date();
  //   oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  //   await this.vietnamNetCrawlerService.deleteOldArticles(oneMonthAgo);
  //   await this.webCrawlerService.deleteOldArticles(oneMonthAgo);
  //   await this.twentyFourHService.deleteOldArticles(oneMonthAgo);

  //   console.log('Old data cleaned up');
  // }

  private mergeArticles(crawlResults: Article[][]): Article[] {
    const allArticles: Article[] = [];
    for (const result of crawlResults) {
      if (Array.isArray(result)) {
        allArticles.push(...result);
      }
    }
    return allArticles;
  }

  private async analyzeArticles(articles: Article[]) {
    this.logger.log(`Starting analysis of ${articles.length} articles`);

    for (const article of articles) {
      try {
        // Kiểm tra xem bài viết đã được phân tích chưa
        const existingAnalysis = await this.checkExistingAnalysis(article.url);
        if (existingAnalysis) {
          this.logger.log(`Article already analyzed: ${article.title}`);
          continue;
        }

        // Sử dụng rate limiter để tránh quá tải OpenAI API
        const analysis = await this.limiter.schedule(() =>
          this.contentAnalyzerService.analyzeContent(
            article.content,
            article.category?.name || 'uncategorized',
          ),
        );

        const categoryName = article.category?.name || 'uncategorized';

        if (!this.crawlResults[categoryName]) {
          this.crawlResults[categoryName] = [];
        }

        this.crawlResults[categoryName].push({
          title: article.title,
          url: article.url,
          description: article.description,
          publishDate: article.publishDate,
          imageUrl: article.imageUrl,
          source: article.source,
          analysis: analysis,
        });

        this.logger.log(`Analyzed article: ${article.title}`);

        // Lưu kết quả phân tích ngay sau khi hoàn thành mỗi bài
        await this.saveIntermediateResult(categoryName, article.url);
      } catch (error) {
        this.logger.error(
          `Error analyzing article ${article.title}:`,
          error.stack,
        );

        // Lưu bài viết với phân tích cơ bản nếu có lỗi
        const categoryName = article.category?.name || 'uncategorized';
        if (!this.crawlResults[categoryName]) {
          this.crawlResults[categoryName] = [];
        }

        this.crawlResults[categoryName].push({
          title: article.title,
          url: article.url,
          description: article.description,
          publishDate: article.publishDate,
          imageUrl: article.imageUrl,
          source: article.source,
          analysis: {
            summary: article.description || '',
            topics: [],
            score: 0,
            sentiment: 'neutral',
            categories: [categoryName],
            keywords: [],
          },
        });
      }
    }
  }

  private async checkExistingAnalysis(url: string): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = path.join(
        process.cwd(),
        'crawl_data',
        `analyzed_articles_${timestamp}.json`,
      );

      if (!fs.existsSync(filePath)) {
        return false;
      }

      const existingData = JSON.parse(
        await fs.promises.readFile(filePath, 'utf8'),
      );

      // Kiểm tra trong tất cả các category
      for (const category in existingData) {
        const found = existingData[category].some(
          (article: AnalyzedArticle) => article.url === url,
        );
        if (found) return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking existing analysis:', error.stack);
      return false;
    }
  }

  private async saveIntermediateResult(category: string, url: string) {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = path.join(
        process.cwd(),
        'crawl_data',
        `analyzed_articles_${timestamp}.json`,
      );

      // Đảm bảo thư mục tồn tại
      await fs.promises.mkdir(path.join(process.cwd(), 'crawl_data'), {
        recursive: true,
      });

      // Lưu kết quả của bài viết hiện tại
      const articleData = this.crawlResults[category].find(
        (article) => article.url === url,
      );

      let existingData = {};
      if (fs.existsSync(filePath)) {
        existingData = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      }

      if (!existingData[category]) {
        existingData[category] = [];
      }

      // Thêm bài viết mới vào category tương ứng
      if (articleData) {
        existingData[category].push(articleData);
      }

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(existingData, null, 2),
        'utf8',
      );
    } catch (error) {
      this.logger.error('Error saving intermediate result:', error.stack);
    }
  }

  private async saveCrawlResults() {
    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const filePath = path.join(
        process.cwd(),
        'crawl_data',
        `analyzed_articles_${timestamp}.json`,
      );

      // Đảm bảo thư mục tồn tại
      await fs.promises.mkdir(path.join(process.cwd(), 'crawl_data'), {
        recursive: true,
      });

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(this.crawlResults, null, 2),
        'utf8',
      );

      this.logger.log(`Crawl results saved to: ${filePath}`);
    } catch (error) {
      this.logger.error('Error saving crawl results:', error.stack);
    }
  }
}
