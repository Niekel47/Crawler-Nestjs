// import { Injectable, OnModuleInit } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Article } from '../models/article.entity';
// import { ConfigService } from '@nestjs/config';
// import { Worker } from 'worker_threads';
// import * as path from 'path';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { Category } from '../models/category.entity';
// import { ArticlesPaginationResult } from 'src/crawler/type';

// @Injectable()
// export class TuoiTreService implements OnModuleInit {
//   private urlCache: Map<string, Date> = new Map();
//   private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
//   private readonly BASE_URL = 'https://tuoitre.vn/';
//   private isRunning = false;

//   constructor(
//     @InjectRepository(Article)
//     private articleRepository: Repository<Article>,
//     @InjectRepository(Category)
//     private categoryRepository: Repository<Category>,
//     private configService: ConfigService,
//   ) {}

//   onModuleInit() {
//     // this.startCrawling();
//   }

//   private async initializeCategories() {
//     const categories = [
//       { name: 'thoi-su', url: 'thoi-su.htm' },
//       { name: 'the-gioi', url: 'the-gioi.htm' },
//       { name: 'phap-luat', url: 'phap-luat.htm' },
//       { name: 'kinh-doanh', url: 'kinh-doanh.htm' },
//       { name: 'cong-nghe', url: 'cong-nghe.htm' },
//       { name: 'xe', url: 'xe.htm' },
//       { name: 'nhip-song-tre', url: 'nhip-song-tre.htm' },
//       { name: 'van-hoa', url: 'van-hoa.htm' },
//       { name: 'giai-tri', url: 'giai-tri.htm' },
//       { name: 'the-thao', url: 'the-thao.htm' },
//       { name: 'giao-duc', url: 'giao-duc.htm' },
//       { name: 'khoa-hoc', url: 'khoa-hoc.htm' },
//       { name: 'suc-khoe', url: 'suc-khoe.htm' },
//       { name: 'gia-that', url: 'gia-that.htm' },
//       { name: 'ban-doc-lam-bao', url: 'ban-doc-lam-bao.htm' },
//       { name: 'du-lich', url: 'du-lich.htm' },
//     ];

//     for (const category of categories) {
//       await this.getOrCreateCategory(category.name);
//     }
//   }

//   @Cron(CronExpression.EVERY_HOUR)
//   async scheduledCrawling() {
//     console.log('Bắt đầu crawl Tuổi Trẻ theo lịch...');
//     await this.startCrawling();
//   }

//   public async startCrawling() {
//     if (this.isRunning) {
//       console.log('Tuổi Trẻ crawler đang chạy');
//       return;
//     }

//     this.isRunning = true;
//     console.log('Bắt đầu crawler Tuổi Trẻ...');

//     try {
//       await this.initializeCategories();

//       const categories = await this.categoryRepository.find();
//       const crawlPromises = categories.map((category) =>
//         this.crawlCategory(category),
//       );

//       await Promise.all(crawlPromises);

//       console.log('Hoàn thành crawler Tuổi Trẻ');
//     } catch (error) {
//       console.error('Lỗi trong quá trình crawl Tuổi Trẻ:', error);
//     } finally {
//       this.isRunning = false;
//     }
//   }

//   private async crawlCategory(category: Category) {
//     return new Promise<void>((resolve, reject) => {
//       const worker = new Worker(path.join(__dirname, 'tuoitre.worker.js'), {
//         workerData: {
//           categoryUrl: `${this.BASE_URL}${category.name}.htm`,
//           BASE_URL: this.BASE_URL,
//         },
//       });

//       worker.on('message', async (message) => {
//         if (message.type === 'article') {
//           await this.saveArticle(message.data, category);
//         }
//       });

//       worker.on('error', reject);
//       worker.on('exit', (code) => {
//         if (code !== 0) {
//           reject(new Error(`Worker stopped with exit code ${code}`));
//         } else {
//           resolve();
//         }
//       });
//     });
//   }

//   private async saveArticle(articleData: Partial<Article>, category: Category) {
//     if (this.isCached(articleData.url)) {
//       console.log(`Bỏ qua bài viết đã cache: ${articleData.url}`);
//       return;
//     }

//     try {
//       const existingArticle = await this.articleRepository.findOne({
//         where: { url: articleData.url },
//       });

//       if (!existingArticle) {
//         const article = this.articleRepository.create({
//           ...articleData,
//           category: category,
//           source: this.BASE_URL,
//         });
//         await this.articleRepository.save(article);
//         console.log(`Đã lưu bài viết mới của Tuổi Trẻ: ${articleData.title}`);
//         this.addToCache(articleData.url);
//       } else {
//         console.log(`Bài viết đã tồn tại: ${articleData.title}`);
//       }
//     } catch (error) {
//       if (error.code === '23505') {
//         console.log(
//           `Bài viết đã tồn tại (concurrent insert): ${articleData.title}`,
//         );
//       } else {
//         console.error(`Lỗi khi lưu bài viết: ${articleData.title}`, error);
//       }
//     }
//   }

//   private async getOrCreateCategory(categoryName: string): Promise<Category> {
//     try {
//       let category = await this.categoryRepository.findOne({
//         where: { name: categoryName },
//       });
//       if (!category) {
//         category = this.categoryRepository.create({
//           name: categoryName,
//         });
//         await this.categoryRepository.save(category);
//       }
//       return category;
//     } catch (error) {
//       if (error.code === '23505') {
//         return await this.categoryRepository.findOne({
//           where: { name: categoryName },
//         });
//       }
//       throw error;
//     }
//   }

//   private isCached(url: string): boolean {
//     const cachedTime = this.urlCache.get(url);
//     if (cachedTime && Date.now() - cachedTime.getTime() < this.CACHE_DURATION) {
//       return true;
//     }
//     return false;
//   }

//   private addToCache(url: string) {
//     this.urlCache.set(url, new Date());
//   }

//   async getArticles(
//     page: number,
//     limit: number,
//     category?: string,
//   ): Promise<ArticlesPaginationResult> {
//     const queryBuilder = this.articleRepository
//       .createQueryBuilder('article')
//       .leftJoinAndSelect('article.category', 'category')
//       .orderBy('article.publishDate', 'DESC');

//     if (category) {
//       queryBuilder.where('category.name = :category', { category });
//     }

//     const [articles, total] = await queryBuilder
//       .skip((page - 1) * limit)
//       .take(limit)
//       .getManyAndCount();

//     return {
//       data: articles,
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//     };
//   }

//   async getArticleById(id: number): Promise<Article> {
//     return await this.articleRepository.findOne({
//       where: { id },
//       relations: ['category'],
//     });
//   }
// }
