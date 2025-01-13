import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { SearchOptions, SearchResult, ArticleDetail } from './types';
import * as vntk from 'vntk';

@Injectable()
export class GoogleSearchService {
  private readonly logger = new Logger(GoogleSearchService.name);
  private readonly SITE_LIST = [
    'https://tuoitre.vn',
    'https://nld.com.vn',
    'https://vnexpress.net',
    'https://thanhnien.vn',
    'https://dantri.com.vn',
  ];

  private readonly wordTokenizer;
  private readonly posTag;
  private readonly dictionary;
  private readonly util;
  private readonly bayesClassifier;

  private readonly STOP_WORDS = new Set([
    'là',
    'và',
    'để',
    'trong',
    'với',
    'của',
    'những',
    'các',
    'được',
    'có',
    'không',
    'này',
    'nào',
    'mà',
    'đó',
    'khi',
    'sẽ',
    'đã',
    'đang',
    'về',
    'vào',
    'tại',
    'trên',
    'lúc',
    'ngày',
    'giữa',
    'sau',
    'tiếp',
    'tục',
    'cũng',
    'như',
    'theo',
    'từ',
    'sẽ',
    'hơn',
    'các',
    'của',
    'và',
    'để',
    'trong',
    'với',
  ]);

  private readonly SPORT_TERMS = new Set([
    'bóng chuyền',
    'vô địch',
    'quốc gia',
    'giải đấu',
    'tuyển',
    'trận đấu',
    'chung kết',
    'vòng',
    'thi đấu',
    'trực tiếp',
  ]);

  private readonly MAIN_CATEGORIES = {
    POLITICS: 'Chính trị',
    ECONOMY: 'Kinh tế',
    SOCIETY: 'Xã hội',
    CULTURE: 'Văn hóa',
    SPORTS: 'Thể thao',
    TECHNOLOGY: 'Công nghệ',
    EDUCATION: 'Giáo dục',
    HEALTH: 'Y tế',
    ENVIRONMENT: 'Môi trường',
    WORLD: 'Thế giới',
  };

  private readonly CATEGORY_KEYWORDS = {
    POLITICS: [
      'chính phủ',
      'quốc hội',
      'đảng',
      'nghị quyết',
      'chính sách',
      'lãnh đạo',
      'đại biểu',
      'bộ trưởng',
    ],
    ECONOMY: [
      'kinh tế',
      'tài chính',
      'thị trường',
      'doanh nghiệp',
      'đầu tư',
      'xuất khẩu',
      'nhập khẩu',
      'gdp',
    ],
    SOCIETY: [
      'xã hội',
      'dân sinh',
      'đời sống',
      'cộng đồng',
      'an sinh',
      'phúc lợi',
    ],
    CULTURE: [
      'văn hóa',
      'nghệ thuật',
      'di sản',
      'lễ hội',
      'truyền thống',
      'điện ảnh',
      'âm nhạc',
    ],
    SPORTS: [
      'thể thao',
      'bóng đá',
      'vô địch',
      'giải đấu',
      'cầu thủ',
      'huấn luyện viên',
      'olympic',
    ],
  };

  // Training data for categories
  private readonly TRAINING_DATA = {
    POLITICS: [
      'chính phủ họp bàn về chính sách mới',
      'quốc hội thông qua nghị quyết',
      'bộ trưởng phát biểu về định hướng phát triển',
      'đại biểu quốc hội thảo luận',
      'chính sách đối ngoại mới',
      'thủ tướng chỉ đạo các bộ ngành',
      'nghị quyết được thông qua',
      'ủy ban thường vụ quốc hội',
      'chủ tịch nước tiếp đón phái đoàn',
      'hội nghị trung ương',
    ],
    ECONOMY: [
      'thị trường chứng khoán biến động',
      'giá xăng dầu tăng mạnh',
      'doanh nghiệp công bố kết quả kinh doanh',
      'xuất khẩu tăng trưởng',
      'ngân hàng điều chỉnh lãi suất',
      'tỷ giá ngoại tệ biến động',
      'chỉ số giá tiêu dùng CPI',
      'thị trường bất động sản',
      'đầu tư trực tiếp nước ngoài',
      'cổ phiếu bluechip',
    ],
    SOCIETY: [
      'đời sống người dân cải thiện',
      'vấn đề an sinh xã hội',
      'hoạt động cộng đồng sôi nổi',
      'phúc lợi xã hội được đảm bảo',
      'dân sinh thay đổi tích cực',
      'tình hình an ninh trật tự',
      'công tác phòng chống dịch',
      'chương trình giảm nghèo',
      'bảo vệ quyền trẻ em',
      'phong trào đền ơn đáp nghĩa',
    ],
    CULTURE: [
      'lễ hội truyền thống độc đáo',
      'di sản văn hóa được bảo tồn',
      'nghệ thuật biểu diễn đặc sắc',
      'văn hóa dân tộc phát triển',
      'điện ảnh Việt Nam tiến bộ',
      'triển lãm nghệ thuật',
      'ca nhạc dân tộc',
      'bảo tàng trưng bày',
      'nghệ sĩ biểu diễn',
      'phim điện ảnh ra mắt',
    ],
    SPORTS: [
      'đội tuyển bóng đá chiến thắng',
      'vận động viên đạt huy chương',
      'giải đấu quốc tế sôi động',
      'huấn luyện viên chia sẻ chiến thuật',
      'thể thao Việt Nam phát triển',
      'cầu thủ xuất sắc',
      'olympic tokyo',
      'sea games',
      'vòng loại world cup',
      'giải vô địch quốc gia',
    ],
  };

  constructor(private readonly configService: ConfigService) {
    this.wordTokenizer = vntk.wordTokenizer();
    this.posTag = vntk.posTag();
    this.dictionary = vntk.dictionary();
    this.util = vntk.util();
    this.bayesClassifier = new vntk.BayesClassifier();
    this.initializeBayesClassifier();
  }

  private initializeBayesClassifier(): void {
    try {
      // Train the classifier with examples
      Object.entries(this.TRAINING_DATA).forEach(([category, examples]) => {
        examples.forEach((example) => {
          this.bayesClassifier.addDocument(example, category);
        });
      });

      // Train the model
      this.bayesClassifier.train();
      this.logger.log('Bayes Classifier trained successfully');
    } catch (error) {
      this.logger.error('Error training Bayes Classifier:', error);
    }
  }

  private calculateTopicCount(tokenCount: number): number {
    const e = 2.71828;
    return Math.max(5, Math.min(30, Math.floor(Math.log2(tokenCount) * e)));
  }

  private normalizeVietnameseText(text: string): string {
    return (
      this.util
        .clean_html(text)
        // Loại bỏ ngày tháng và số
        .replace(/\d+[-/]\d+[-/]\d+|\d+[/-]\d+|\d+/g, ' ')
        // Giữ lại chữ cái Latin và dấu tiếng Việt
        .replace(/[^a-zA-ZÀ-ỹ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  private tokenizeVietnamese(text: string): string[] {
    try {
      return this.wordTokenizer.tag(text);
    } catch (error) {
      this.logger.error('Error in word tokenization:', error);
      return text.split(' ');
    }
  }

  private async analyzePhrase(phrase: string) {
    try {
      const tags = this.posTag.tag(phrase);

      let score = 0;
      for (const [, tag] of tags) {
        switch (tag) {
          case 'N':
          case 'Np':
          case 'V':
            score += 2;
            break;
          case 'A':
            score += 1.5;
            break;
          default:
            score += 0.5;
        }
      }
      return {
        score,
        hasNoun: tags.some(([, tag]) => tag === 'N' || tag === 'Np'),
        hasVerb: tags.some(([, tag]) => tag === 'V'),
      };
    } catch (error) {
      this.logger.error('Error in POS tagging:', error);
      return {
        score: 1,
        hasNoun: true,
        hasVerb: true,
      };
    }
  }

  private isStopWord(word: string): boolean {
    return this.STOP_WORDS.has(word.toLowerCase());
  }

  private isValidPhrase(phrase: string): boolean {
    const words = phrase.split(' ');

    if (words.length < 2 || words.length > 4) return false;

    if (this.isStopWord(words[0]) || this.isStopWord(words[words.length - 1])) {
      return false;
    }

    if (this.SPORT_TERMS.has(phrase.toLowerCase())) {
      return true;
    }

    return words.some(
      (word) =>
        word.length >= 2 &&
        (this.dictionary.has(word.toLowerCase()) ||
          this.SPORT_TERMS.has(word.toLowerCase())),
    );
  }

  private getUniqueNGrams(words: string[], n: number): string[] {
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (this.isValidPhrase(phrase)) {
        ngrams.add(phrase);
      }
    }
    return Array.from(ngrams);
  }

  private async scorePhraseVietnamese(
    phrase: string,
    wordFreq: Record<string, number>,
  ): Promise<number> {
    const words = phrase.split(' ');
    const analysis = await this.analyzePhrase(phrase);
    const freqScore =
      words.reduce((sum, word) => sum + (wordFreq[word] || 0), 0) /
      words.length;
    const grammarScore = analysis.score;
    const sportTermBonus = this.SPORT_TERMS.has(phrase.toLowerCase()) ? 2 : 1;
    const dictionaryBonus = this.dictionary.has(phrase) ? 1.5 : 1;
    const stopWordPenalty = words.some((word) => this.isStopWord(word))
      ? 0.5
      : 1;
    const lengthBonus = words.length >= 2 && words.length <= 3 ? 1.5 : 1;

    return (
      freqScore *
      grammarScore *
      sportTermBonus *
      dictionaryBonus *
      stopWordPenalty *
      lengthBonus
    );
  }

  private async getMainTopics(text: string): Promise<string[]> {
    const normalizedText = this.normalizeVietnameseText(text);
    const words = this.tokenizeVietnamese(normalizedText);
    const topicCount = this.calculateTopicCount(words.length);

    // Sử dụng Bayes để phân loại văn bản
    const mainCategory = this.bayesClassifier.classify(normalizedText);
    const categoryKeywords = this.CATEGORY_KEYWORDS[mainCategory] || [];

    const wordFreq: Record<string, number> = {};
    words.forEach((word) => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const bigrams = this.getUniqueNGrams(words, 2);
    const trigrams = this.getUniqueNGrams(words, 3);
    const quadgrams = this.getUniqueNGrams(words, 4);

    // Tăng điểm cho các cụm từ liên quan đến chủ đề chính
    const scoredPhrases = await Promise.all(
      [...bigrams, ...trigrams, ...quadgrams].map(async (phrase) => {
        let baseScore = await this.scorePhraseVietnamese(phrase, wordFreq);

        // Tăng điểm nếu cụm từ chứa từ khóa của chủ đề chính
        const containsCategoryKeyword = categoryKeywords.some((keyword) =>
          phrase.toLowerCase().includes(keyword.toLowerCase()),
        );
        if (containsCategoryKeyword) {
          baseScore *= 1.5; // Tăng 50% điểm cho các cụm từ liên quan đến chủ đề
        }

        return {
          phrase,
          score: baseScore,
          category: mainCategory,
        };
      }),
    );

    scoredPhrases.sort((a, b) => b.score - a.score);

    const topPhrases = new Set<string>();
    const usedWords = new Set<string>();
    const categoryPhrases = new Set<string>();

    // Ưu tiên chọn các cụm từ liên quan đến chủ đề chính
    for (const { phrase } of scoredPhrases) {
      const phraseWords = phrase.split(' ');
      if (!phraseWords.some((word) => usedWords.has(word))) {
        if (
          categoryKeywords.some((keyword) =>
            phrase.toLowerCase().includes(keyword.toLowerCase()),
          )
        ) {
          categoryPhrases.add(phrase);
        } else {
          topPhrases.add(phrase);
        }
        phraseWords.forEach((word) => usedWords.add(word));
      }
      if (categoryPhrases.size + topPhrases.size >= topicCount) break;
    }

    // Kết hợp các cụm từ, ưu tiên các cụm từ liên quan đến chủ đề
    const combinedPhrases = [...categoryPhrases, ...topPhrases].slice(
      0,
      topicCount,
    );
    return combinedPhrases;
  }

  private async classifyContent(text: string): Promise<string[]> {
    try {
      // Clean and normalize text
      const cleanText = this.util.clean_html(text);

      // Get Bayes classification
      const bayesCategory = this.bayesClassifier.classify(cleanText);

      // Get keyword-based classification
      const tokens = this.wordTokenizer.tag(cleanText.toLowerCase());
      const categories = new Map<string, number>();

      // Score each category based on keywords
      for (const [category, keywords] of Object.entries(
        this.CATEGORY_KEYWORDS,
      )) {
        let score = 0;
        for (const token of tokens) {
          if (keywords.includes(token)) {
            score++;
          }
        }
        if (score > 0) {
          categories.set(category, score);
        }
      }

      // Combine both classifications
      const keywordCategories = Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([category]) => this.MAIN_CATEGORIES[category]);

      // Add Bayes classification if not already included
      if (!keywordCategories.includes(this.MAIN_CATEGORIES[bayesCategory])) {
        keywordCategories.unshift(this.MAIN_CATEGORIES[bayesCategory]);
      }

      return keywordCategories.length > 0
        ? keywordCategories
        : ['Chưa phân loại'];
    } catch (error) {
      this.logger.error('Lỗi khi phân loại nội dung:', error);
      return ['Chưa phân loại'];
    }
  }

  private async generateTags(text: string): Promise<string[]> {
    try {
      const posTags = this.posTag.tag(text);
      const tags = new Set<string>();

      // Xử lý các cụm từ có ý nghĩa
      for (let i = 0; i < posTags.length - 1; i++) {
        const [word, tag] = posTags[i];
        const nextTag = posTags[i + 1]?.[1];

        if (
          (tag === 'N' && nextTag === 'N') || // Cụm danh từ
          (tag === 'N' && nextTag === 'A') || // Danh từ + Tính từ
          (tag === 'V' && nextTag === 'N') // Động từ + Danh từ
        ) {
          const phrase = `${word} ${posTags[i + 1][0]}`;
          if (phrase.length > 5) {
            tags.add(phrase);
          }
        }
      }

      // Thêm các từ đơn có ý nghĩa
      posTags.forEach(([word, tag]) => {
        if (
          (tag === 'Np' || tag === 'N') && // Danh từ riêng hoặc danh từ
          word.length > 3 &&
          !this.isStopWord(word)
        ) {
          tags.add(word);
        }
      });

      return Array.from(tags).slice(0, 10);
    } catch (error) {
      this.logger.error('Lỗi khi tạo tags:', error);
      return [];
    }
  }

  async searchKeyword(
    keyword: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const googleApiKey = this.configService.get<string>('GOOGLE_API_KEY');
    const googleCx = this.configService.get<string>('GOOGLE_CX');

    if (!googleApiKey || !googleCx) {
      throw new Error(
        'Google API credentials not found in environment variables',
      );
    }

    const baseUrl = 'https://customsearch.googleapis.com/customsearch/v1';
    const searchParams = {
      key: googleApiKey,
      cx: googleCx,
      hl: options.language || 'vi',
      num: Math.min(options.resultCount || 10, 10),
      q: '',
      dateRestrict: '',
      sort: '',
    };

    if (options.dateRange) {
      const { from, to } = options.dateRange;
      searchParams.dateRestrict = this.getDateRestrictParam(from, to);
      if (options.sortBy === 'date') {
        searchParams.sort = 'date';
      }
    }

    for (const site of this.SITE_LIST) {
      try {
        const siteKeyword = `${keyword} site:${site}`;
        searchParams.q = siteKeyword;

        const response = await axios.get(baseUrl, { params: searchParams });

        if (response.data.items && Array.isArray(response.data.items)) {
          const siteResults = await Promise.all(
            response.data.items.map(async (item) => {
              const snippet = item.snippet || '';
              const topics = await this.getMainTopics(snippet);
              const categories = await this.classifyContent(snippet);
              const tags = await this.generateTags(snippet);
              const publishTime =
                item.pagemap?.metatags?.[0]?.['article:published_time'];

              return {
                title: item.title,
                snippet: snippet,
                url: item.link || '',
                topics: topics || [],
                categories: categories || ['Chưa phân loại'],
                tags: tags || [],
                publishDate: publishTime ? new Date(publishTime) : null,
                source: site,
              };
            }),
          );
          results.push(...siteResults);
        }
      } catch (error) {
        this.logger.error(`Error searching ${site}:`, error.message);
        continue;
      }
    }

    if (options.sortBy === 'date') {
      results.sort((a, b) => {
        if (!a.publishDate || !b.publishDate) return 0;
        return b.publishDate.getTime() - a.publishDate.getTime();
      });
    }

    await this.exportToCsv(results, keyword);
    await this.exportToJson(results, keyword);

    return results;
  }

  private getDateRestrictParam(from: Date, to: Date): string {
    const now = new Date();
    const fromDiff = Math.ceil(
      (now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
    );
    const toDiff = Math.ceil(
      (now.getTime() - to.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (toDiff < 0) return '';

    if (fromDiff <= 1) return 'd1';
    if (fromDiff <= 7) return 'w1';
    if (fromDiff <= 30) return 'm1';
    if (fromDiff <= 365) return 'y1';

    return '';
  }

  private async exportToCsv(
    results: SearchResult[],
    keyword: string,
  ): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: path.join(process.cwd(), `${keyword}_results.csv`),
      header: [
        { id: 'title', title: 'Title' },
        { id: 'snippet', title: 'Snippet' },
        { id: 'url', title: 'URL' },
        { id: 'topics', title: 'Topics' },
        { id: 'categories', title: 'Categories' },
        { id: 'tags', title: 'Tags' },
      ],
    });

    const recordsWithArrays = results.map((result) => ({
      ...result,
      topics: Array.isArray(result.topics) ? result.topics.join(', ') : '',
      categories: Array.isArray(result.categories)
        ? result.categories.join(', ')
        : '',
      tags: Array.isArray(result.tags) ? result.tags.join(', ') : '',
    }));

    await csvWriter.writeRecords(recordsWithArrays);
  }

  private async exportToJson(
    results: SearchResult[],
    keyword: string,
  ): Promise<void> {
    const jsonContent = JSON.stringify(results, null, 2);
    const filePath = path.join(process.cwd(), `${keyword}_results.json`);

    try {
      await fs.promises.writeFile(filePath, jsonContent, 'utf8');
      this.logger.log(`Results exported to JSON file: ${filePath}`);
    } catch (error) {
      this.logger.error('Error exporting to JSON:', error);
    }
  }

  private async crawlArticleDetail(url: string): Promise<ArticleDetail> {
    try {
      const response = await axios.get(url);
      const html = response.data;

      const cleanText = this.util.clean_html(html);
      const content = this.extractMainContent(cleanText);
      const images = this.extractImages(html);
      const tags = await this.extractTags(content);
      const author = this.extractAuthor(html);
      const publishDate = this.extractPublishDate(html);

      return {
        url,
        content,
        images,
        tags,
        author,
        publishDate,
      };
    } catch (error) {
      this.logger.error(
        `Error crawling article detail from ${url}:`,
        error.message,
      );
      throw error;
    }
  }

  private extractMainContent(cleanText: string): string {
    try {
      const contentRegex =
        /<article[^>]*>(.*?)<\/article>|<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/i;
      const match = cleanText.match(contentRegex);

      if (match) {
        const content = match[1] || match[2];
        return this.normalizeVietnameseText(content);
      }

      return '';
    } catch (error) {
      this.logger.error('Error extracting main content:', error);
      return '';
    }
  }

  private extractImages(html: string): string[] {
    try {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      const images: string[] = [];
      let match;

      while ((match = imgRegex.exec(html)) !== null) {
        if (match[1]) {
          images.push(match[1]);
        }
      }

      return images;
    } catch (error) {
      this.logger.error('Error extracting images:', error);
      return [];
    }
  }

  private async extractTags(content: string): Promise<string[]> {
    return this.getMainTopics(content);
  }

  private extractAuthor(html: string): string | null {
    try {
      const authorRegex = /<meta[^>]+name="author"[^>]+content="([^"]+)"/i;
      const match = html.match(authorRegex);

      if (match && match[1]) {
        return match[1];
      }

      return null;
    } catch (error) {
      this.logger.error('Error extracting author:', error);
      return null;
    }
  }

  private extractPublishDate(html: string): Date | null {
    try {
      const dateRegex =
        /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i;
      const match = html.match(dateRegex);

      if (match && match[1]) {
        return new Date(match[1]);
      }

      return null;
    } catch (error) {
      this.logger.error('Error extracting publish date:', error);
      return null;
    }
  }

  async searchKeywordWithDetails(
    keyword: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const basicResults = await this.searchKeyword(keyword, options);
    const uniqueResults = this.removeDuplicateResults(basicResults);

    const detailedResults = await Promise.all(
      uniqueResults.map(async (result) => {
        try {
          const details = await this.crawlArticleDetail(result.url);
          return {
            ...result,
            ...details,
          };
        } catch (error) {
          this.logger.error(
            `Error getting details for ${result.url}:`,
            error.message,
          );
          return result;
        }
      }),
    );

    await this.exportToCsv(detailedResults, keyword);
    await this.exportToJson(detailedResults, keyword);

    return detailedResults;
  }

  private removeDuplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    for (const result of results) {
      const normalizedTitle = this.normalizeVietnameseText(result.title);
      const key = `${result.url}|${normalizedTitle}`;

      if (!seen.has(key)) {
        seen.add(key);
        uniqueResults.push(result);
      }
    }

    return uniqueResults;
  }
}
