// import { Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { Client } from '@elastic/elasticsearch';
// import { Article } from '../models/article.entity';
// import { LoggingService } from '../logging/logging.service';

// @Injectable()
// export class ElasticsearchService {
//   private readonly client: Client;
//   private readonly articleIndex = 'articles';
//   private static instance: ElasticsearchService;

//   constructor(
//     private readonly configService: ConfigService,
//     private readonly logger: LoggingService,
//   ) {
//     const username = this.configService.get<string>('ELASTICSEARCH_USERNAME');
//     const password = this.configService.get<string>('ELASTICSEARCH_PASSWORD');
//     const node =
//       this.configService.get<string>('ELASTICSEARCH_NODE') ||
//       'http://localhost:9200';

//     this.client = new Client({
//       node,
//       auth: {
//         username,
//         password,
//       },
//       tls: {
//         rejectUnauthorized: false,
//       },
//     });

//     this.initializeIndex();
//   }

//   public static getInstance(
//     configService: ConfigService,
//     logger: LoggingService,
//   ): ElasticsearchService {
//     if (!ElasticsearchService.instance) {
//       ElasticsearchService.instance = new ElasticsearchService(
//         configService,
//         logger,
//       );
//     }
//     return ElasticsearchService.instance;
//   }

//   private async initializeIndex() {
//     try {
//       const exists = await this.client.indices.exists({
//         index: this.articleIndex,
//       });

//       if (!exists) {
//         await this.createIndex(this.articleIndex, {
//           mappings: {
//             properties: {
//               title: { type: 'text', analyzer: 'vietnamese' },
//               content: { type: 'text', analyzer: 'vietnamese' },
//               description: { type: 'text', analyzer: 'vietnamese' },
//               url: { type: 'keyword' },
//               source: { type: 'keyword' },
//               category: { type: 'keyword' },
//               publishDate: { type: 'date' },
//               imageUrl: { type: 'keyword' },
//             },
//           },
//           settings: {
//             analysis: {
//               analyzer: {
//                 vietnamese: {
//                   tokenizer: 'standard',
//                   filter: ['lowercase', 'asciifolding'],
//                 },
//               },
//             },
//           },
//         });
//         this.logger.log('Elasticsearch index created successfully');
//       }
//     } catch (error) {
//       this.logger.error('Error initializing Elasticsearch index:', error.stack);
//     }
//   }

//   public async createIndex(indexName: string, settings: any) {
//     try {
//       const exists = await this.client.indices.exists({ index: indexName });
//       if (!exists) {
//         const response = await this.client.indices.create({
//           index: indexName,
//           body: settings,
//         });
//         return response;
//       }
//       return { acknowledged: true, message: 'Index already exists.' };
//     } catch (error) {
//       this.logger.error(`Error creating index ${indexName}:`, error.stack);
//       throw error;
//     }
//   }

//   public async deleteIndex(indexName: string) {
//     try {
//       const exists = await this.client.indices.exists({ index: indexName });
//       if (exists) {
//         const response = await this.client.indices.delete({ index: indexName });
//         return response;
//       }
//       return { acknowledged: true, message: 'Index does not exist.' };
//     } catch (error) {
//       this.logger.error(`Error deleting index ${indexName}:`, error.stack);
//       throw error;
//     }
//   }

//   async indexArticle(article: Article) {
//     try {
//       const document = {
//         title: article.title,
//         content: article.content,
//         description: article.description,
//         url: article.url,
//         source: article.source,
//         category: article.category?.name,
//         publishDate: article.publishDate,
//         imageUrl: article.imageUrl,
//       };

//       const response = await this.client.index({
//         index: this.articleIndex,
//         id: article.id.toString(),
//         document,
//       });

//       this.logger.log(`Indexed article: ${article.title}`);
//       return response;
//     } catch (error) {
//       this.logger.error(
//         `Error indexing article ${article.title}:`,
//         error.stack,
//       );
//       throw error;
//     }
//   }

//   async searchArticles(
//     searchTerm: string,
//     filters?: {
//       source?: string;
//       category?: string;
//       fromDate?: Date;
//       toDate?: Date;
//     },
//   ) {
//     try {
//       // Build the main query with better relevance scoring
//       const must: any[] = [
//         {
//           bool: {
//             should: [
//               // Exact phrase matches get highest boost
//               {
//                 multi_match: {
//                   query: searchTerm,
//                   fields: ['title^4', 'content^2', 'description^3'],
//                   type: 'phrase',
//                   boost: 4,
//                 },
//               },
//               // Fuzzy matches on individual terms
//               {
//                 multi_match: {
//                   query: searchTerm,
//                   fields: ['title^3', 'content^1', 'description^2'],
//                   fuzziness: 'AUTO',
//                   boost: 2,
//                 },
//               },
//               // Prefix matches for partial word matching
//               {
//                 multi_match: {
//                   query: searchTerm,
//                   fields: ['title^2', 'content^1', 'description^1'],
//                   type: 'phrase_prefix',
//                   boost: 1,
//                 },
//               },
//             ],
//           },
//         },
//       ];

//       // Add filters if provided
//       if (filters) {
//         if (filters.source) {
//           must.push({ term: { source: filters.source } });
//         }
//         if (filters.category) {
//           must.push({ term: { category: filters.category } });
//         }
//         if (filters.fromDate || filters.toDate) {
//           const range: any = { publishDate: {} };
//           if (filters.fromDate) range.publishDate.gte = filters.fromDate;
//           if (filters.toDate) range.publishDate.lte = filters.toDate;
//           must.push({ range });
//         }
//       }

//       const response = await this.client.search({
//         index: this.articleIndex,
//         body: {
//           query: {
//             bool: { must },
//           },
//           sort: [
//             { _score: { order: 'desc' } },
//             { publishDate: { order: 'desc' } },
//           ],
//           highlight: {
//             fields: {
//               title: {
//                 number_of_fragments: 3,
//                 fragment_size: 150,
//               },
//               content: {
//                 number_of_fragments: 3,
//                 fragment_size: 150,
//               },
//               description: {
//                 number_of_fragments: 3,
//                 fragment_size: 150,
//               },
//             },
//             pre_tags: ['<em>'],
//             post_tags: ['</em>'],
//           },
//           _source: true,
//           explain: true,
//         },
//       });

//       return response.hits.hits.map((hit: any) => ({
//         id: hit._id,
//         score: hit._score,
//         highlights: hit.highlight || {},
//         ...hit._source,
//       }));
//     } catch (error) {
//       this.logger.error('Error searching articles:', error.stack);
//       return [];
//     }
//   }

//   async freeTextSearch(
//     indexName: string,
//     searchTerm: string,
//     fields: string[] = ['title', 'content', 'description'],
//   ) {
//     try {
//       const response = await this.client.search({
//         index: indexName,
//         body: {
//           query: {
//             query_string: {
//               query: `*${searchTerm}*`,
//               fields,
//             },
//           },
//           sort: [{ publishDate: 'desc' }],
//         },
//       });

//       return response.hits.hits.map((hit) => hit._source);
//     } catch (error) {
//       this.logger.error('Error performing free text search:', error.stack);
//       return [];
//     }
//   }

//   async deleteArticle(articleId: string) {
//     try {
//       const response = await this.client.delete({
//         index: this.articleIndex,
//         id: articleId,
//       });
//       this.logger.log(`Deleted article with ID: ${articleId}`);
//       return response;
//     } catch (error) {
//       this.logger.error(`Error deleting article ${articleId}:`, error.stack);
//       throw error;
//     }
//   }

//   async bulkIndexArticles(articles: Article[]) {
//     try {
//       const operations = articles.flatMap((article) => [
//         { index: { _index: this.articleIndex, _id: article.id.toString() } },
//         {
//           title: article.title,
//           content: article.content,
//           description: article.description,
//           url: article.url,
//           source: article.source,
//           category: article.category?.name,
//           publishDate: article.publishDate,
//           imageUrl: article.imageUrl,
//         },
//       ]);

//       const response = await this.client.bulk({ operations });
//       if (response.errors) {
//         this.logger.error(
//           'Bulk indexing had errors:',
//           JSON.stringify(response.items),
//         );
//         return { success: false, errors: response.items };
//       }

//       this.logger.log(`Bulk indexed ${articles.length} articles`);
//       return { success: true, items: response.items };
//     } catch (error) {
//       this.logger.error('Error bulk indexing articles:', error.stack);
//       throw error;
//     }
//   }

//   async syncArticlesToElastic(articles: Article[]) {
//     try {
//       this.logger.log('Syncing articles to Elasticsearch');

//       // Delete existing articles
//       await this.deleteIndex(this.articleIndex);
//       await this.initializeIndex();

//       // Bulk index new articles
//       const result = await this.bulkIndexArticles(articles);

//       this.logger.log('Articles sync completed');
//       return result;
//     } catch (error) {
//       this.logger.error(
//         'Error syncing articles to Elasticsearch:',
//         error.stack,
//       );
//       throw error;
//     }
//   }
// }
