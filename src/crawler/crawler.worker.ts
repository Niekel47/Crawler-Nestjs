import { parentPort, workerData } from 'worker_threads';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as moment from 'moment';
import { Article } from '../models/article.entity';

const { articleType, BASE_URL } = workerData;

async function crawlArticleType(maxPages = 5) {
  for (let page = 1; page <= maxPages; page++) {
    const urls = await getUrlsOfTypeThread(page);

    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const article = await extractContent(url);
          if (article) {
            return { type: 'article', data: article };
          } else {
            console.log(
              `Bỏ qua bài viết: ${url} (không trích xuất được nội dung)`,
            );
            return null;
          }
        } catch (error) {
          console.error(`Lỗi khi crawl ${url}:`, error);
          return null;
        }
      }),
    );

    results.filter(Boolean).forEach((result) => {
      parentPort.postMessage(result);
    });

    await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 giây delay sau khi xử lý tất cả URL của một trang
  }
}

async function getUrlsOfTypeThread(pageNumber: number): Promise<string[]> {
  const pageUrl = `${BASE_URL}${articleType}-p${pageNumber}`;
  const { data } = await axios.get(pageUrl);
  const $ = cheerio.load(data);
  const titles = $('.title-news');

  if (titles.length === 0) {
    console.log(`Không tìm thấy bài viết nào tại ${pageUrl}`);
    return [];
  }

  return titles.map((_, element) => $(element).find('a').attr('href')).get();
}

async function extractContent(url: string): Promise<Partial<Article> | null> {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const { data } = await axios.get(url, { timeout: 30000 });
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

      const category = $('.breadcrumb li:last-child a').text().trim();

      const imageUrl =
        $('.fig-picture img').attr('data-src') ||
        $('.fig-picture img').attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        null;

      return cleanArticleData({
        title,
        description,
        content,
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

function cleanArticleData(article: Partial<Article>): Partial<Article> {
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

function standardizeDate(dateString: string): Date {
  try {
    moment.locale('vi');
    const parsedDate = moment(dateString, [
      'dddd, DD/M/YYYY, HH:mm (Z)',
      'DD/MM/YYYY, HH:mm',
      'HH:mm DD/MM/YYYY',
    ]);
    if (!parsedDate.isValid()) {
      throw new Error('Ngày không hợp lệ');
    }
    return parsedDate.toDate();
  } catch (error) {
    console.error(`Lỗi khi chuẩn hóa ngày: ${dateString}`, error);
    return new Date();
  }
}

crawlArticleType().then(() => {
  parentPort.postMessage({ type: 'done' });
});
