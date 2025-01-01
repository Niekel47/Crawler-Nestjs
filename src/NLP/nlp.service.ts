// import { Injectable, OnModuleInit } from '@nestjs/common';
// import { LoggingService } from '../logging/logging.service';
// import * as natural from 'natural';
// import { NlpManager } from 'node-nlp';
// import * as compromise from 'compromise';
// import * as tf from '@tensorflow/tfjs-node';
// import * as use from '@tensorflow-models/universal-sentence-encoder';

// @Injectable()
// export class NLPService implements OnModuleInit {
//   private readonly tokenizer: natural.WordTokenizer;
//   private readonly tfidf: natural.TfIdf;
//   private readonly nlpManager: NlpManager;
//   private useModel: any;
//   private readonly wordnet: any;

//   constructor(private readonly logger: LoggingService) {
//     this.tokenizer = new natural.WordTokenizer();
//     this.tfidf = new natural.TfIdf();
//     this.nlpManager = new NlpManager({ languages: ['vi'] });
//     this.wordnet = new natural.WordNet();
//   }

//   async onModuleInit() {
//     try {
//       // Load Universal Sentence Encoder model
//       this.useModel = await use.load();
//       this.logger.log('NLP models loaded successfully');
//     } catch (error) {
//       this.logger.error('Error loading NLP models', error.stack);
//       throw error;
//     }
//   }

//   async analyzeText(text: string, searchKeyword?: string) {
//     try {
//       const [entities, topics, sentiment, keywords, relevance] =
//         await Promise.all([
//           this.extractEntities(text),
//           this.extractTopics(text),
//           this.analyzeSentiment(text),
//           this.extractKeywords(text),
//           searchKeyword
//             ? this.calculateSemanticSimilarity(text, searchKeyword)
//             : Promise.resolve(1),
//         ]);

//       return {
//         entities,
//         topics,
//         sentiment,
//         keywords,
//         relevance,
//       };
//     } catch (error) {
//       this.logger.error('Error analyzing text', error.stack);
//       throw error;
//     }
//   }

//   private async extractEntities(text: string) {
//     try {
//       // Use Compromise for named entity recognition
//       const doc = compromise(text);

//       const entities = {
//         people: doc.people().out('array'),
//         places: doc.places().out('array'),
//         organizations: doc.organizations().out('array'),
//         dates: doc.dates().out('array'),
//       };

//       return Object.entries(entities)
//         .map(([type, values]) =>
//           values.map((value) => ({ entity: value, type })),
//         )
//         .flat();
//     } catch (error) {
//       this.logger.error('Error extracting entities', error.stack);
//       return [];
//     }
//   }

//   private async extractTopics(text: string) {
//     try {
//       // Use TF-IDF for topic extraction
//       this.tfidf.addDocument(text);
//       const terms = this.tfidf.listTerms(0);

//       // Group similar terms using WordNet
//       const topics = await this.groupSimilarTerms(
//         terms.slice(0, 10).map((term) => term.term),
//       );

//       return topics.map((topic, index) => ({
//         topic,
//         score: 1 - index * 0.1, // Simple scoring based on position
//       }));
//     } catch (error) {
//       this.logger.error('Error extracting topics', error.stack);
//       return [];
//     }
//   }

//   private async analyzeSentiment(text: string) {
//     try {
//       const result = await this.nlpManager.process('vi', text);
//       return {
//         score: result.sentiment.score,
//         label: result.sentiment.vote,
//       };
//     } catch (error) {
//       this.logger.error('Error analyzing sentiment', error.stack);
//       return { score: 0, label: 'neutral' };
//     }
//   }

//   private async extractKeywords(text: string) {
//     try {
//       // Tokenize and remove stopwords
//       const tokens = this.tokenizer.tokenize(text);
//       const stopwords = natural.stopwords;
//       const filteredTokens = tokens.filter(
//         (token) => !stopwords.includes(token.toLowerCase()),
//       );

//       // Calculate TF-IDF scores
//       this.tfidf.addDocument(filteredTokens);
//       const terms = this.tfidf.listTerms(0);

//       return terms.slice(0, 20).map((term) => ({
//         keyword: term.term,
//         score: term.tfidf,
//       }));
//     } catch (error) {
//       this.logger.error('Error extracting keywords', error.stack);
//       return [];
//     }
//   }

//   private async calculateSemanticSimilarity(text1: string, text2: string) {
//     try {
//       // Use Universal Sentence Encoder for semantic similarity
//       const embeddings = await this.useModel.embed([text1, text2]);
//       const [embedding1, embedding2] = await Promise.all([
//         embeddings.array().then((arr) => arr[0]),
//         embeddings.array().then((arr) => arr[1]),
//       ]);

//       // Calculate cosine similarity
//       const similarity = this.cosineSimilarity(embedding1, embedding2);
//       embeddings.dispose();

//       return similarity;
//     } catch (error) {
//       this.logger.error('Error calculating semantic similarity', error.stack);
//       return 0.5;
//     }
//   }

//   private async groupSimilarTerms(terms: string[]) {
//     const groups = new Map<string, Set<string>>();

//     for (const term of terms) {
//       let foundGroup = false;
//       for (const [groupTerm, group] of groups.entries()) {
//         const similarity = await this.calculateSemanticSimilarity(
//           term,
//           groupTerm,
//         );
//         if (similarity > 0.7) {
//           group.add(term);
//           foundGroup = true;
//           break;
//         }
//       }
//       if (!foundGroup) {
//         groups.set(term, new Set([term]));
//       }
//     }

//     return Array.from(groups.keys());
//   }

//   private cosineSimilarity(a: number[], b: number[]) {
//     const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
//     const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
//     const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
//     return dotProduct / (magnitudeA * magnitudeB);
//   }

//   async findRelatedTerms(keyword: string): Promise<string[]> {
//     return new Promise((resolve) => {
//       this.wordnet.lookup(keyword, (results) => {
//         const relatedTerms = new Set<string>();

//         results.forEach((result) => {
//           // Add synonyms
//           result.synonyms.forEach((syn) => relatedTerms.add(syn));

//           // Add hypernyms (more general terms)
//           if (result.pos === 'n') {
//             result.ptrs
//               .filter((ptr) => ptr.pointerSymbol === '@')
//               .forEach((ptr) => relatedTerms.add(ptr.term));
//           }
//         });

//         resolve(Array.from(relatedTerms));
//       });
//     });
//   }
// }
