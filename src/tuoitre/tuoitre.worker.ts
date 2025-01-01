// import { parentPort, workerData } from 'worker_threads';
// import axios from 'axios';
// import cheerio from 'cheerio';
// import * as moment from 'moment';
// import { Article } from '../models/article.entity';
// import { Category } from '../models/category.entity';

// const { categoryUrl, BASE_URL } = workerData;

// // Rate Limiter class để kiểm soát tốc độ request
// class RateLimiter {
//   private queue: Array<() => Promise<any>> = [];
//   private processing = false;

//   constructor(private delay: number) {}

//   async schedule<T>(fn: () => Promise<T>): Promise<T> {
//     return new Promise((resolve, reject) => {
//       this.queue.push(async () => {
//         try {
//           const result = await fn();
//           resolve(result);
//         } catch (error) {
//           reject(error);
//         }
//       });

//       if (!this.processing) {
//         this.processQueue();
//       }
//     });
//   }

//   private async processQueue() {
//     if (this.queue.length === 0) {
//       this.processing = false;
//       return;
//     }

//     this.processing = true;
//     const fn = this.queue.shift();

//     if (fn) {
//       await fn();
//       await new Promise((resolve) => setTimeout(resolve, this.delay));
//       await this.processQueue();
//     }
//   }
// }

// const rateLimiter = new RateLimiter(1000); // 1 request/second

// async function crawlCategory(maxPages: number = 5): Promise<Article[]> {
//   const articles: Article[] = [];

//   try {
//     for (let page = 1; page <= maxPages; page++) {
//       const pageUrl =
//         page === 1 ? categoryUrl : `${categoryUrl}/trang-${page}.htm`;

//       const html = await rateLimiter.schedule(() =>
//         axios.get(pageUrl).then((res) => res.data),
//       );

//       const $ = cheerio.load(html);

//       // Crawl bài viết từ box-category-middle
//       $('.box-category-middle .box-category-item').each((_, element) => {
//         const article = parseArticle($, element);
//         if (article) articles.push(article);
//       });
//     }

//     return articles;
//   } catch (error) {
//     console.error('Error crawling category:', error);
//     throw error;
//   }
// }

// function parseArticle(
//   $: cheerio.Root,
//   element: cheerio.Element,
// ): Article | null {
//   try {
//     const $element = $(element);

//     // Lấy tiêu đề và URL
//     const titleElement = $element.find('.box-title a');
//     const title = titleElement.text().trim();
//     const url = BASE_URL + titleElement.attr('href');

//     // Lấy mô tả
//     const description = $element.find('.box-content-des').text().trim();

//     // Lấy thời gian - nếu không tìm thấy thì dùng thời gian hiện tại
//     const dateStr = $element.find('.box-time').text().trim();
//     const publishDate = dateStr ? standardizeDate(dateStr) : new Date();

//     // Lấy ảnh thumbnail
//     const thumbnail = $element.find('.img-resize img').attr('src') || '';

//     // Lấy category
//     const category = categoryUrl.split('/').pop()?.replace('.htm', '') || '';

//     return {
//       id: 0,
//       title,
//       url,
//       description,
//       content: description,
//       publishDate,
//       thumbnail,
//       imageUrl: thumbnail,
//       source: 'tuoitre.vn',
//       categoryId: 0,
//       category: {
//         id: 0,
//         name: category,
//         articles: [],
//       } as Category,
//     } as Article;
//   } catch (error) {
//     console.error('Error parsing article:', error);
//     return null;
//   }
// }

// function standardizeDate(dateString: string): Date {
//   try {
//     const date = moment(dateString, [
//       'DD/MM/YYYY HH:mm',
//       'HH:mm DD/MM/YYYY',
//       'DD/MM HH:mm',
//     ]);

//     if (date.isValid()) {
//       return date.toDate();
//     }
//     return new Date(); // Trả về thời gian hiện tại nếu không parse được
//   } catch (error) {
//     console.error('Error standardizing date:', error);
//     return new Date(); // Trả về thời gian hiện tại nếu có lỗi
//   }
// }

// // Bắt đầu crawl
// crawlCategory()
//   .then((articles) => {
//     parentPort?.postMessage({ type: 'success', data: articles });
//   })
//   .catch((error) => {
//     parentPort?.postMessage({ type: 'error', error: error.message });
//   });
