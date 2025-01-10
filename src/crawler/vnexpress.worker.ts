import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { Article } from '../models/article.entity';

@Injectable()
export class VnExpressWorker {
  async crawlArticle(url: string): Promise<Partial<Article>> {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract main content
      const content = [];
      $('p.Normal').each((_, element) => {
        const text = $(element).text().trim();
        if (text) {
          content.push(text);
        }
      });

      // Extract related links
      const relatedLinks = [];
      $('.box-tinlienquanv2 article.item-news').each((_, element) => {
        const link = $(element).find('h4.title-news a').attr('href');
        const title = $(element).find('h4.title-news a').text().trim();
        const description = $(element).find('p.description a').text().trim();
        if (link && title) {
          relatedLinks.push({
            url: link,
            title,
            description,
          });
        }
      });

      // Extract article metadata
      const title = $('h1.title-detail').text().trim();
      const description = $('.description').first().text().trim();
      const publishDate = new Date();

      return {
        title,
        description,
        content: content.join('\n'),
        url,
        source: 'vnexpress',
        publishDate,
        relatedLinks: JSON.stringify(relatedLinks),
      } as Partial<Article>;
    } catch (error) {
      console.error(`Error crawling article from ${url}:`, error.message);
      throw error;
    }
  }

  async extractLinksFromArticle(url: string): Promise<string[]> {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      const links = new Set<string>();

      // Extract links from article content
      $('p.Normal a').each((_, element) => {
        const link = $(element).attr('href');
        if (link && link.includes('vnexpress.net')) {
          links.add(link);
        }
      });

      // Extract links from related articles
      $('.box-tinlienquanv2 article.item-news h4.title-news a').each(
        (_, element) => {
          const link = $(element).attr('href');
          if (link && link.includes('vnexpress.net')) {
            links.add(link);
          }
        },
      );

      return Array.from(links);
    } catch (error) {
      console.error(`Error extracting links from ${url}:`, error.message);
      throw error;
    }
  }
}
