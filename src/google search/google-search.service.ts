import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import { SearchOptions, SearchResult, ArticleDetail } from './types';
import * as vntk from 'vntk';

@Injectable()
export class GoogleSearchService {
  private readonly SITE_LIST = [
    // 'https://tuoitre.vn',
    // 'https://nld.com.vn',
    // 'https://tienphong.vn',
    // 'https://dantri.com.vn',
    // 'https://zingnews.vn',
    // 'https://vietnamnet.vn',
    // 'https://vov.vn',
    // 'https://laodong.vn',
    // 'https://www.sggp.org.vn',
    // 'https://plo.vn',
    // 'https://nhandan.vn',
    // 'https://baochinhphu.vn',
    // 'https://vtv.vn',
    // 'https://vneconomy.vn',
    // 'https://cafef.vn',
    // 'https://vietbao.vn',
    // 'https://kenh14.vn',
    // 'https://soha.vn',
    // 'https://genk.vn',
    'https://vnexpress.net',
    // 'https://baomoi.com',
    // 'https://thanhnien.vn',
    // 'https://www.msn.com/vi-vn',
    // 'https://luatduonggia.vn/',
    // 'https://vi.wikipedia.org/',
    // 'https://vnur.vn/',
  ];

  private readonly wordTokenizer;
  private readonly posTag;
  private readonly dictionary;

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

  private readonly NAME_PREFIXES = new Set([
    'lebron',
    'kevin',
    'stephen',
    'james',
    'durant',
    'curry',
  ]);

  constructor(private readonly configService: ConfigService) {
    this.wordTokenizer = vntk.wordTokenizer();
    this.posTag = vntk.posTag();
    this.dictionary = vntk.dictionary();
  }

  private calculateTopicCount(tokenCount: number): number {
    const e = 2.71828;

    return Math.max(5, Math.min(30, Math.floor(Math.log2(tokenCount) * e)));
  }

  private isVietnameseWord(word: string): boolean {
    return word.length >= 2 && this.dictionary.has(word.toLowerCase());
  }

  private normalizeVietnameseText(text: string): string {
    const util = vntk.util();
    return (
      util
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
      console.error('Error in word tokenization:', error);
      return text.split(' ');
    }
  }

  private async analyzePhrase(phrase: string) {
    try {
      const tags = this.posTag.tag(phrase);

      let score = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [_, tag] of tags) {
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        hasNoun: tags.some(([_, tag]) => tag === 'N' || tag === 'Np'),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        hasVerb: tags.some(([_, tag]) => tag === 'V'),
      };
    } catch (error) {
      console.error('Error in POS tagging:', error);
      return {
        score: 1,
        hasNoun: true,
        hasVerb: true,
      };
    }
  }

  private isNamePart(word: string): boolean {
    return this.NAME_PREFIXES.has(word.toLowerCase());
  }

  private isStopWord(word: string): boolean {
    return this.STOP_WORDS.has(word.toLowerCase());
  }

  private isValidPhrase(phrase: string): boolean {
    const words = phrase.split(' ');

    // Kiểm tra độ dài từ
    if (words.length < 2 || words.length > 4) return false;

    // Kiểm tra stop words ở đầu và cuối
    if (this.isStopWord(words[0]) || this.isStopWord(words[words.length - 1])) {
      return false;
    }

    // Kiểm tra xem có phải là thuật ngữ thể thao
    if (this.SPORT_TERMS.has(phrase.toLowerCase())) {
      return true;
    }

    // Kiểm tra từ điển và độ dài từ
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

    // Thưởng cho cụm từ thể thao
    const sportTermBonus = this.SPORT_TERMS.has(phrase.toLowerCase()) ? 2 : 1;

    // Thưởng cho cụm từ có trong từ điển
    const dictionaryBonus = this.dictionary.has(phrase) ? 1.5 : 1;

    // Phạt cho cụm từ có stop words
    const stopWordPenalty = words.some((word) => this.isStopWord(word))
      ? 0.5
      : 1;

    // Thưởng cho độ dài phù hợp
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

    const wordFreq: Record<string, number> = {};
    words.forEach((word) => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const bigrams = this.getUniqueNGrams(words, 2);
    const trigrams = this.getUniqueNGrams(words, 3);
    const quadgrams = this.getUniqueNGrams(words, 4);

    const scoredPhrases = await Promise.all(
      [...bigrams, ...trigrams, ...quadgrams].map(async (phrase) => ({
        phrase,
        score: await this.scorePhraseVietnamese(phrase, wordFreq),
      })),
    );

    scoredPhrases.sort((a, b) => b.score - a.score);

    const topPhrases = new Set<string>();
    const usedWords = new Set<string>();

    for (const { phrase } of scoredPhrases) {
      const phraseWords = phrase.split(' ');
      if (!phraseWords.some((word) => usedWords.has(word))) {
        topPhrases.add(phrase);
        phraseWords.forEach((word) => usedWords.add(word));
      }
      if (topPhrases.size >= topicCount) break;
    }

    return Array.from(topPhrases);
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

    // Xây dựng tham số tìm kiếm
    const searchParams: any = {
      key: googleApiKey,
      cx: googleCx,
      hl: options.language || 'vi',
      num: Math.min(options.resultCount || 10, 10), // Google API giới hạn 10 kết quả/request
    };

    // Thêm bộ lọc ngày tháng
    if (options.dateRange) {
      const { from, to } = options.dateRange;
      searchParams.dateRestrict = this.getDateRestrictParam(from, to);
      // Thêm sort=date nếu lọc theo ngày
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
              const publishTime =
                item.pagemap?.metatags?.[0]?.['article:published_time'];

              return {
                title: item.title,
                snippet: snippet,
                url: item.link || '',
                topics: topics || [],
                publishDate: publishTime ? new Date(publishTime) : null,
                source: site,
              };
            }),
          );
          results.push(...siteResults);
        }
      } catch (error) {
        console.error(`Error searching ${site}:`, error.message);
        continue;
      }
    }

    // Sắp xếp kết quả nếu cần
    if (options.sortBy === 'date') {
      results.sort((a, b) => {
        if (!a.publishDate || !b.publishDate) return 0;
        return b.publishDate.getTime() - a.publishDate.getTime();
      });
    }

    await this.exportToCsv(results, keyword);
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

    // Nếu khoảng thời gian kết thúc trong quá khứ, không áp dụng bộ lọc
    if (toDiff < 0) return '';

    // Sử dụng mốc thời gian bắt đầu để xác định phạm vi
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
      path: path.join(process.cwd(), `${keyword}_questions.csv`),
      header: [
        { id: 'title', title: 'Title' },
        { id: 'snippet', title: 'Snippet' },
        { id: 'url', title: 'URL' },
        { id: 'topics', title: 'Topics' },
      ],
    });

    const recordsWithTopics = results.map((result) => ({
      ...result,
      topics: Array.isArray(result.topics) ? result.topics.join(', ') : '',
    }));

    await csvWriter.writeRecords(recordsWithTopics);
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

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.tokenizeVietnamese(text1.toLowerCase()));
    const words2 = new Set(this.tokenizeVietnamese(text2.toLowerCase()));

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );

    return intersection.size / Math.max(words1.size, words2.size);
  }

  private async crawlArticleDetail(url: string): Promise<ArticleDetail> {
    try {
      const response = await axios.get(url);
      console.log('Respone lấy được', response);
      const html = response.data;
      console.log('HTML cần phân tích', html);

      // Sử dụng VNTK để phân tích nội dung
      const util = vntk.util();
      const cleanText = util.clean_html(html);

      // Phân tích nội dung
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
        sentiment: await this.analyzeSentiment(content),
      };
    } catch (error) {
      console.error(
        `Error crawling article detail from ${url}:`,
        error.message,
      );
      throw error;
    }
  }

  private extractMainContent(cleanText: string): string {
    try {
      // Tìm thẻ article hoặc div chứa nội dung chính
      const contentRegex =
        /<article[^>]*>(.*?)<\/article>|<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/i;
      const match = cleanText.match(contentRegex);

      if (match) {
        const content = match[1] || match[2];
        return this.normalizeVietnameseText(content);
      }

      return '';
    } catch (error) {
      console.error('Error extracting main content:', error);
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
      console.error('Error extracting images:', error);
      return [];
    }
  }

  private async extractTags(content: string): Promise<string[]> {
    // Sử dụng getMainTopics để trích xuất tags
    return this.getMainTopics(content);
  }

  private extractAuthor(html: string): string | null {
    try {
      // Tìm meta tag chứa thông tin tác giả
      const authorRegex = /<meta[^>]+name="author"[^>]+content="([^"]+)"/i;
      const match = html.match(authorRegex);

      if (match && match[1]) {
        return match[1];
      }

      return null;
    } catch (error) {
      console.error('Error extracting author:', error);
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
      console.error('Error extracting publish date:', error);
      return null;
    }
  }

  private async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
  }> {
    try {
      const words = this.tokenizeVietnamese(text);
      const score = 0;
      let wordCount = 0;

      for (const word of words) {
        if (this.isVietnameseWord(word)) {
          // Implement sentiment scoring logic here
          wordCount++;
        }
      }

      const avgScore = score / wordCount;

      return {
        sentiment:
          avgScore > 0.1
            ? 'positive'
            : avgScore < -0.1
              ? 'negative'
              : 'neutral',
        score: avgScore,
      };
    } catch (error) {
      console.error('Error in sentiment analysis:', error);
      return {
        sentiment: 'neutral',
        score: 0,
      };
    }
  }

  private async exportToJson(
    results: SearchResult[],
    keyword: string,
  ): Promise<void> {
    const jsonContent = JSON.stringify(results, null, 2);
    const filePath = path.join(process.cwd(), `${keyword}_results.json`);

    try {
      await fs.promises.writeFile(filePath, jsonContent, 'utf8');
      console.log(`Results exported to JSON file: ${filePath}`);
    } catch (error) {
      console.error('Error exporting to JSON:', error);
    }
  }

  async searchKeywordWithDetails(
    keyword: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    // Tìm kiếm cơ bản
    const basicResults = await this.searchKeyword(keyword, options);

    // Loại bỏ kết quả trùng lặp
    const uniqueResults = this.removeDuplicateResults(basicResults);

    // Thêm chi tiết cho mỗi kết quả
    const detailedResults = await Promise.all(
      uniqueResults.map(async (result) => {
        try {
          const details = await this.crawlArticleDetail(result.url);
          return {
            ...result,
            ...details,
          };
        } catch (error) {
          console.error(
            `Error getting details for ${result.url}:`,
            error.message,
          );
          return result;
        }
      }),
    );

    // Xuất kết quả ra cả CSV và JSON
    await this.exportToCsv(detailedResults, keyword);
    await this.exportToJson(detailedResults, keyword);

    return detailedResults;
  }
}
