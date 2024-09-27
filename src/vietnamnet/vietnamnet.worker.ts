import { parentPort, workerData } from 'worker_threads';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as moment from 'moment';
import { VietnamnetArticle } from './vietnamnetarticle.entity';

const { articleType, BASE_URL } = workerData;

async function crawlArticleType(maxArticles = 60) {
  const urls = await getUrlsOfTypeThread();
  const articlesToProcess = urls.slice(0, maxArticles);

  const results = await Promise.all(
    articlesToProcess.map(async (url) => {
      try {
        const article = await extractContent(url);
        if (article) {
          return { type: 'article', data: article };
        } else {
          console.log(
            `Bỏ qua bài viết VietnamNet: ${url} (không trích xuất được nội dung)`,
          );
          return null;
        }
      } catch (error) {
        console.error(`Lỗi khi crawl VietnamNet ${url}:`, error);
        return null;
      }
    }),
  );

  results.filter(Boolean).forEach((result) => {
    parentPort.postMessage(result);
  });

  await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 giây delay sau khi xử lý tất cả URL
}

async function getUrlsOfTypeThread(): Promise<string[]> {
  const pageUrl = `${BASE_URL}${articleType}`;
  try {
    const { data } = await axios.get(pageUrl, { timeout: 30000 });
    const $ = cheerio.load(data);
    const articles = $('.horizontalPost__main-title');

    if (articles.length === 0) {
      console.log(`Không tìm thấy bài viết nào tại ${pageUrl}`);
      return [];
    }

    return articles
      .map((_, element) => {
        const href = $(element).find('a').attr('href');
        return href
          ? href.startsWith('http')
            ? href
            : `${BASE_URL}${href.startsWith('/') ? href.slice(1) : href}`
          : null;
      })
      .get()
      .filter((url) => url !== null);
  } catch (error) {
    console.error(`Lỗi khi lấy URLs từ ${pageUrl}:`, error.message);
    return [];
  }
}

async function extractContent(
  url: string,
): Promise<Partial<VietnamnetArticle> | null> {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const { data } = await axios.get(url, { timeout: 30000 });
      const $ = cheerio.load(data);

      const title = $('h1.content-detail-title').first().text().trim();
      if (!title) return null;

      const description = $('.content-detail-sapo').text().trim();
      const publishDate = $('.bread-crumb-detail__time').first().text().trim();

      const category = $('.bread-crumb-detail__list li:last-child a')
        .text()
        .trim();

      const imageUrl =
        $('meta[property="og:image"]').attr('content') ||
        $('.fig-picture img').attr('src') ||
        $('.fig-picture img').attr('data-src') ||
        null;

      return cleanArticleData({
        title,
        description,
        content: '', // Bỏ qua phần nội dung
        url,
        publishDate: standardizeDate(publishDate),
        category: category || articleType,
        imageUrl,
      });
    } catch (error) {
      console.error(`Lỗi khi trích xuất nội dung từ ${url}:`, error.message);
      retries++;
      if (retries >= maxRetries) {
        console.error(`Đã đạt số lần thử tối đa cho ${url}`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * retries));
    }
  }
  return null;
}

function standardizeDate(dateString: string): Date {
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

function cleanArticleData(
  article: Partial<VietnamnetArticle>,
): Partial<VietnamnetArticle> {
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

crawlArticleType().then(() => {
  parentPort.postMessage({ type: 'done' });
});
