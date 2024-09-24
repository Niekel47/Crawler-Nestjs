import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './article.entity';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as moment from 'moment';

@Injectable()
export class WebCrawlerService implements OnModuleInit {
  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
  ) {}

  private BASE_URL = 'https://vnexpress.net/';
  private articleTypes = {
    0: 'thoi-su',
    1: 'du-lich',
    2: 'the-gioi',
    3: 'kinh-doanh',
    4: 'khoa-hoc',
    5: 'giai-tri',
    6: 'the-thao',
    7: 'phap-luat',
    8: 'giao-duc',
    9: 'suc-khoe',
    10: 'doi-song',
  };

  private isRunning = false;

  onModuleInit() {
    this.startCrawling();
  }

  private async startCrawling() {
    if (this.isRunning) {
      console.log('Crawler is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting crawler...');

    try {
      for (const [, articleType] of Object.entries(this.articleTypes)) {
        await this.crawlArticleType(articleType);
      }
    } catch (error) {
      console.error('Error during crawling:', error);
    } finally {
      this.isRunning = false;
      console.log('Crawling finished');
    }
  }

  private async crawlArticleType(articleType: string, maxPages: number = 5) {
    for (let page = 1; page <= maxPages; page++) {
      const urls = await this.getUrlsOfTypeThread(articleType, page);
      for (const url of urls) {
        try {
          const article = await this.extractContent(url, articleType);
          if (article) {
            await this.saveArticle(article);
          } else {
            console.log(`Skipping article: ${url} (no content extracted)`);
          }
        } catch (error) {
          console.error(`Error crawling ${url}:`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
  }

  private async getUrlsOfTypeThread(
    articleType: string,
    pageNumber: number,
  ): Promise<string[]> {
    const pageUrl = `${this.BASE_URL}${articleType}-p${pageNumber}`;
    const { data } = await axios.get(pageUrl);
    const $ = cheerio.load(data);
    const titles = $('.title-news');

    if (titles.length === 0) {
      console.log(`Couldn't find any news in ${pageUrl}`);
      return [];
    }

    return titles.map((_, element) => $(element).find('a').attr('href')).get();
  }

  private async extractContent(
    url: string,
    articleType: string,
  ): Promise<Partial<Article> | null> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);

        const title = $('h1.title-detail').first().text().trim();
        if (!title) return null;

        const description = $('p.description')
          .contents()
          .map((_, el) => $(el).text())
          .get()
          .join(' ')
          .trim();
        const content = $('p.Normal')
          .map((_, el) => $(el).text())
          .get()
          .join('\n')
          .trim();
        const publishDate = $('.header-content .date').first().text().trim();

        // Lấy category từ breadcrumb
        const category = $('.breadcrumb li:last-child a').text().trim();

        // Lấy URL ảnh
        const imageUrl =
          $('.fig-picture img').attr('data-src') ||
          $('.fig-picture img').attr('src') ||
          $('meta[property="og:image"]').attr('content') ||
          null;

        return this.cleanArticleData({
          title,
          description,
          content,
          url,
          publishDate: this.standardizeDate(publishDate),
          category: category || articleType,
          imageUrl,
        });
      } catch (error) {
        console.error(`Error extracting content from ${url}:`, error.message);
        retries++;
        if (retries >= maxRetries) {
          console.error(`Max retries reached for ${url}`);
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * retries)); // Exponential backoff
      }
    }
    return null;
  }

  private cleanArticleData(article: Partial<Article>): Partial<Article> {
    const cleanText = (text: string) =>
      text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      ...article,
      title: cleanText(article.title),
      description: cleanText(article.description),
      content: cleanText(article.content),
      category: article.category,
      imageUrl: article.imageUrl ? article.imageUrl.trim() : null,
    };
  }

  private standardizeDate(dateString: string): Date {
    try {
      moment.locale('vi');
      const parsedDate = moment(dateString, [
        'dddd, DD/M/YYYY, HH:mm (Z)',
        'DD/MM/YYYY, HH:mm',
        'HH:mm DD/MM/YYYY',
      ]);
      if (!parsedDate.isValid()) {
        throw new Error('Invalid date');
      }
      return parsedDate.toDate();
    } catch (error) {
      console.error(`Error standardizing date: ${dateString}`, error);
      return new Date();
    }
  }

  private async saveArticle(articleData: Partial<Article>) {
    const existingArticle = await this.articleRepository.findOne({
      where: { url: articleData.url },
    });
    if (!existingArticle) {
      const article = this.articleRepository.create(articleData);
      await this.articleRepository.save(article);
      console.log(`Saved new article: ${articleData.title}`);
    }
  }

  stopCrawling() {
    this.isRunning = false;
  }

  async getArticles() {
    return this.articleRepository.find();
  }
}
