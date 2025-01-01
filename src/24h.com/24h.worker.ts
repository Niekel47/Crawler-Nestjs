import { parentPort, workerData } from 'worker_threads';
import axios from 'axios';
import * as cheerio from 'cheerio';
import moment from 'moment';
import { Article } from '../models/article.entity';

const { articleType, BASE_URL } = workerData;

async function crawlArticleType() {
  try {
    const response = await axios.get(`${BASE_URL}${articleType}.html`);
    const $ = cheerio.load(response.data);

    const articles = [];

    // Lấy bài viết nổi bật
    const featuredArticle = $('.cate-24h-foot-box-live-news-hightl-big');
    if (featuredArticle.length) {
      const title = featuredArticle
        .find('.cate-24h-foot-box-live-news-hightl-big-title')
        .text()
        .trim();
      const url = featuredArticle.find('a').attr('href');
      const imageUrl =
        featuredArticle.find('img').attr('src') ||
        featuredArticle.find('img').attr('data-original');

      articles.push({
        title,
        url: url ? new URL(url, BASE_URL).href : null,
        imageUrl: imageUrl ? new URL(imageUrl, BASE_URL).href : null,
        isFeatured: true,
      });
    }

    // Lấy các bài viết khác
    $('.cate-24h-foot-box-news-hightl-small').each((index, element) => {
      const $element = $(element);
      const title = $element.find('h3 a').text().trim();
      const url = $element.find('h3 a').attr('href');
      const imageUrl =
        $element.find('img').attr('src') ||
        $element.find('img').attr('data-original');

      articles.push({
        title,
        url: url ? new URL(url, BASE_URL).href : null,
        imageUrl: imageUrl ? new URL(imageUrl, BASE_URL).href : null,
        isFeatured: false,
      });
    });

    for (const article of articles) {
      if (article.url) {
        const fullArticle = await crawlFullArticle(article.url);
        parentPort.postMessage({
          type: 'article',
          data: { ...article, ...fullArticle },
        });
      }
    }
  } catch (error) {
    console.error(`Error crawling article type ${articleType}:`, error);
  }
}

async function crawlFullArticle(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const content = $('.cate-24h-foot-arti-deta-info').text().trim();
    const author = $('.nguontin').text().trim();
    const category = $('.breadcrumb-box__link').last().text().trim();
    const publishedDate = $('.cate-24h-foot-arti-deta-cre-post').text().trim();

    return {
      content,
      author,
      category,
      publishedDate: standardizeDate(publishedDate),
    };
  } catch (error) {
    console.error(`Error crawling full article ${url}:`, error);
    return { content: '', author: '', category: '', publishedDate: new Date() };
  }
}

function standardizeDate(dateString) {
  try {
    moment.locale('vi');
    const parsedDate = moment(dateString, [
      'DD/MM/YYYY HH:mm',
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

crawlArticleType().then(() => {
  parentPort.postMessage({ type: 'done' });
});
