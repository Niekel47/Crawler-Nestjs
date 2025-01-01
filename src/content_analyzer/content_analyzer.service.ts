import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { RateLimiter } from 'limiter';
import { LoggingService } from '../logging/logging.service';
import * as natural from 'natural';

interface AnalysisResult {
  summary: string;
  topics: string[];
  score: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  categories: string[];
  keywords: string[];
}

@Injectable()
export class ContentAnalyzerService {
  private openai: OpenAI;
  private limiter: RateLimiter;
  private readonly MAX_TOKENS = 4000;
  private readonly EMPTY_STRING = '';
  private tokenizer: natural.WordTokenizer;
  private readonly MAIN_CATEGORIES = {
    POLITICS: 'Chính trị',
    SOCIETY: 'Xã hội',
    ECONOMY: 'Kinh tế',
    TECHNOLOGY: 'Công nghệ',
    HEALTH: 'Sức khỏe',
    EDUCATION: 'Giáo dục',
    ENTERTAINMENT: 'Giải trí',
    SPORTS: 'Thể thao',
    WORLD: 'Thế giới',
  };

  private readonly CATEGORY_KEYWORDS = {
    POLITICS: [
      'chính phủ',
      'quốc hội',
      'đảng',
      'chính sách',
      'lãnh đạo',
      'nghị quyết',
      'bộ trưởng',
    ],
    SOCIETY: [
      'xã hội',
      'đời sống',
      'cộng đồng',
      'dân sinh',
      'người dân',
      'sinh hoạt',
    ],
    ECONOMY: [
      'kinh tế',
      'tài chính',
      'thị trường',
      'doanh nghiệp',
      'đầu tư',
      'chứng khoán',
      'ngân hàng',
    ],
    TECHNOLOGY: [
      'công nghệ',
      'kỹ thuật',
      'số hóa',
      'phần mềm',
      'ứng dụng',
      'thiết bị',
    ],
    HEALTH: [
      'sức khỏe',
      'y tế',
      'bệnh viện',
      'điều trị',
      'bác sĩ',
      'dịch bệnh',
    ],
    EDUCATION: [
      'giáo dục',
      'học sinh',
      'sinh viên',
      'trường học',
      'đại học',
      'giảng dạy',
    ],
    ENTERTAINMENT: [
      'giải trí',
      'nghệ sĩ',
      'điện ảnh',
      'âm nhạc',
      'showbiz',
      'sao việt',
    ],
    SPORTS: [
      'thể thao',
      'bóng đá',
      'vận động viên',
      'giải đấu',
      'olympic',
      'thi đấu',
    ],
    WORLD: [
      'quốc tế',
      'thế giới',
      'nước ngoài',
      'toàn cầu',
      'châu á',
      'châu âu',
    ],
  };

  // Thêm từ điển cảm xúc
  private readonly SENTIMENT_WORDS = {
    positive: [
      'tốt',
      'hay',
      'tuyệt',
      'thành công',
      'phát triển',
      'tích cực',
      'hiệu quả',
      'tiến bộ',
      'hạnh phúc',
      'vui',
    ],
    negative: [
      'kém',
      'xấu',
      'thất bại',
      'khó khăn',
      'suy giảm',
      'tiêu cực',
      'thất vọng',
      'tệ',
      'buồn',
      'đau',
    ],
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    this.limiter = new RateLimiter({
      tokensPerInterval: 3,
      interval: 'minute',
      fireImmediately: true,
    });

    this.tokenizer = new natural.WordTokenizer();
  }

  private splitTextIntoChunks(text: string): string[] {
    const tokens = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = this.EMPTY_STRING;

    for (const token of tokens) {
      if ((currentChunk + ' ' + token).length <= this.MAX_TOKENS) {
        currentChunk += ' ' + token;
      } else {
        chunks.push(currentChunk.trim());
        currentChunk = token;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async waitForRateLimit(): Promise<void> {
    const remainingTokens = await this.limiter.removeTokens(1);
    if (remainingTokens < 0) {
      const waitTime = Math.abs(remainingTokens) * (60 / 3) * 1000; // Convert to milliseconds
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  private getPrompt(
    news_content: string,
    news_topic: string,
    current: number,
    total: number,
  ): string {
    return (
      `Hãy tóm tắt phần ${current}/${total} ` +
      `của bài báo sau:\n\n\n\n${news_content}\n\n\n\n` +
      `Chỉ tập trung vào nội dung liên quan đến chủ đề: ${news_topic}`
    );
  }

  private getUniqueNGrams(words: string[], n: number): string[] {
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(' '));
    }
    return Array.from(ngrams);
  }

  private scorePhrases(
    phrases: string[],
    wordFreq: Record<string, number>,
  ): Array<{ phrase: string; score: number }> {
    return phrases.map((phrase) => {
      const words = phrase.split(' ');
      const score =
        words.reduce((sum, word) => sum + (wordFreq[word] || 0), 0) /
        words.length;
      return { phrase, score };
    });
  }

  private calculateTopicCount(tokenCount: number): number {
    const e = 2.71828;
    return Math.max(5, Math.min(30, Math.floor(Math.log2(tokenCount) * e)));
  }

  private extractTopics(text: string): string[] {
    const words = this.tokenizer.tokenize(text);
    const topicCount = this.calculateTopicCount(words.length);

    // Calculate word frequencies
    const wordFreq: Record<string, number> = {};
    words.forEach((word) => {
      if (word.length > 3) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Get unique bigrams and trigrams
    const bigrams = this.getUniqueNGrams(words, 2);
    const trigrams = this.getUniqueNGrams(words, 3);

    // Score phrases
    const scoredBigrams = this.scorePhrases(bigrams, wordFreq);
    const scoredTrigrams = this.scorePhrases(trigrams, wordFreq);

    // Combine and sort all phrases
    const allPhrases = [...scoredBigrams, ...scoredTrigrams].sort(
      (a, b) => b.score - a.score,
    );

    // Select top phrases, ensuring no word is repeated
    const topPhrases: string[] = [];
    const usedWords = new Set<string>();

    for (const { phrase } of allPhrases) {
      const phraseWords = phrase.split(' ');
      if (!phraseWords.some((word) => usedWords.has(word))) {
        topPhrases.push(phrase);
        phraseWords.forEach((word) => usedWords.add(word));
        if (topPhrases.length === topicCount) break;
      }
    }

    return topPhrases;
  }

  private calculateContentScore(text: string, topics: string[]): number {
    const words = this.tokenizer.tokenize(text);
    const uniqueWords = new Set(words).size;
    const topicCoverage = topics.length;
    const contentLength = words.length;

    // Tính điểm dựa trên độ dài, độ đa dạng từ vựng và số lượng chủ đề
    const lengthScore = Math.min(contentLength / 1000, 1); // Chuẩn hóa độ dài
    const vocabularyScore = uniqueWords / contentLength;
    const topicScore = topicCoverage / this.calculateTopicCount(contentLength);

    // Trọng số cho từng thành phần
    const weights = {
      length: 0.3,
      vocabulary: 0.4,
      topics: 0.3,
    };

    // Tính điểm tổng hợp
    const finalScore =
      (lengthScore * weights.length +
        vocabularyScore * weights.vocabulary +
        topicScore * weights.topics) *
      100;

    return Math.round(finalScore * 100) / 100; // Làm tròn đến 2 chữ số thập phân
  }

  private async analyzeChunkedContent(
    text: string,
    topic: string,
    maxTokens: number,
  ): Promise<string> {
    try {
      const chunks = this.splitTextIntoChunks(text);
      let result = this.EMPTY_STRING;
      maxTokens = Math.floor(maxTokens / chunks.length);

      for (let i = 0; i < chunks.length; i++) {
        await this.waitForRateLimit();

        const content = this.getPrompt(chunks[i], topic, i + 1, chunks.length);

        if (!this.configService.get<string>('OPENAI_API_KEY')) {
          result += this.generateBasicSummary(chunks[i]) + ' ';
          continue;
        }

        try {
          const response = await this.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content }],
            max_tokens: maxTokens,
            temperature: 0.1,
            top_p: 0.1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
          });

          result +=
            response.choices[0]?.message?.content ||
            this.generateBasicSummary(chunks[i]) + ' ';
        } catch (error) {
          result += this.generateBasicSummary(chunks[i]) + ' ';
        }
      }

      return result.trim();
    } catch (error) {
      this.logger.error('Error in chunked content analysis:', error.stack);
      return this.generateBasicSummary(text);
    }
  }

  private async analyzeNonChunkedContent(
    text: string,
    topic: string,
    maxTokens: number,
  ): Promise<string> {
    try {
      if (!this.configService.get<string>('OPENAI_API_KEY')) {
        return this.generateBasicSummary(text);
      }

      await this.waitForRateLimit();

      const prompt = `Hãy tóm tắt bài báo sau và phân tích các ý chính:\n\n\n\n${text}\n\n\n\nTập trung vào chủ đề: ${topic}`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature: 0.1,
          top_p: 0.1,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
        });

        return (
          response.choices[0]?.message?.content ||
          this.generateBasicSummary(text)
        );
      } catch (error) {
        return this.generateBasicSummary(text);
      }
    } catch (error) {
      this.logger.error('Error in non-chunked content analysis:', error.stack);
      return this.generateBasicSummary(text);
    }
  }

  private generateBasicSummary(text: string): string {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const importantSentences = sentences.slice(0, 3); // Lấy 3 câu đầu tiên
    return importantSentences.join('. ') + '.';
  }

  private async analyzeSentiment(
    text: string,
  ): Promise<'positive' | 'negative' | 'neutral'> {
    try {
      if (!this.configService.get<string>('OPENAI_API_KEY')) {
        return this.basicSentimentAnalysis(text);
      }

      await this.waitForRateLimit();

      try {
        const prompt = `Analyze the sentiment of the following text and respond with only one word (positive, negative, or neutral):\n\n${text}`;
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 10,
          temperature: 0.1,
        });

        const sentiment = response.choices[0]?.message?.content
          ?.toLowerCase()
          .trim();
        if (
          sentiment === 'positive' ||
          sentiment === 'negative' ||
          sentiment === 'neutral'
        ) {
          return sentiment;
        }
        return this.basicSentimentAnalysis(text);
      } catch (error) {
        return this.basicSentimentAnalysis(text);
      }
    } catch (error) {
      this.logger.error('Error in sentiment analysis:', error.stack);
      return this.basicSentimentAnalysis(text);
    }
  }

  private basicSentimentAnalysis(
    text: string,
  ): 'positive' | 'negative' | 'neutral' {
    const words = text.toLowerCase().split(/\s+/);
    let score = 0;

    words.forEach((word) => {
      if (this.SENTIMENT_WORDS.positive.includes(word)) score++;
      if (this.SENTIMENT_WORDS.negative.includes(word)) score--;
    });

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  async analyzeContent(
    text: string,
    topic: string,
    maxTokens: number = 1000,
  ): Promise<AnalysisResult> {
    if (!text || !topic) {
      return {
        summary: this.EMPTY_STRING,
        topics: [],
        score: 0,
        sentiment: 'neutral',
        categories: ['Uncategorized'],
        keywords: [],
      };
    }

    try {
      // Phân tích cơ bản không phụ thuộc OpenAI
      const topics = this.extractTopics(text);
      const score = this.calculateContentScore(text, topics);
      const keywords = this.extractKeywords(text);

      // Xử lý song song các phân tích
      const [summary, sentiment, categories] = await Promise.allSettled([
        text.length > this.MAX_TOKENS
          ? this.analyzeChunkedContent(text, topic, maxTokens)
          : this.analyzeNonChunkedContent(text, topic, maxTokens),
        this.analyzeSentiment(text),
        this.classifyContent(text),
      ]);

      return {
        summary:
          summary.status === 'fulfilled'
            ? summary.value
            : this.generateBasicSummary(text),
        topics,
        score,
        sentiment:
          sentiment.status === 'fulfilled' ? sentiment.value : 'neutral',
        categories:
          categories.status === 'fulfilled'
            ? categories.value
            : ['Uncategorized'],
        keywords,
      };
    } catch (error) {
      this.logger.error('Error in content analysis:', error.stack);
      return {
        summary: this.generateBasicSummary(text),
        topics: this.extractTopics(text),
        score: this.calculateContentScore(text, []),
        sentiment: 'neutral',
        categories: ['Uncategorized'],
        keywords: this.extractKeywords(text),
      };
    }
  }

  private async classifyContent(text: string): Promise<string[]> {
    try {
      const tokens = this.tokenizer.tokenize(text.toLowerCase());
      const categories = new Map<string, number>();

      // Phân loại dựa trên từ khóa
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

      // Lấy top categories dựa trên điểm số
      const topCategories = Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => this.MAIN_CATEGORIES[category]);

      if (topCategories.length === 0) {
        // Nếu không tìm thấy category nào, thử dùng OpenAI
        if (this.configService.get<string>('OPENAI_API_KEY')) {
          try {
            const aiCategory = await this.getAIClassification(text);
            return [aiCategory];
          } catch (error) {
            return ['Uncategorized'];
          }
        }
        return ['Uncategorized'];
      }

      return topCategories;
    } catch (error) {
      this.logger.error('Error in content classification:', error.stack);
      return ['Uncategorized'];
    }
  }

  private async getAIClassification(text: string): Promise<string> {
    try {
      if (!this.configService.get<string>('OPENAI_API_KEY')) {
        return 'Uncategorized';
      }

      await this.waitForRateLimit();

      const prompt = `Phân loại nội dung sau vào một trong các danh mục: ${Object.values(
        this.MAIN_CATEGORIES,
      ).join(', ')}. Chỉ trả về tên danh mục:\n\n${text}`;

      try {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 10,
          temperature: 0.3,
        });

        const category = response.choices[0]?.message?.content?.trim();
        return category || 'Uncategorized';
      } catch (error) {
        return 'Uncategorized';
      }
    } catch (error) {
      this.logger.error('Error in AI classification:', error.stack);
      return 'Uncategorized';
    }
  }

  private extractKeywords(text: string): string[] {
    const words = this.tokenizer.tokenize(text.toLowerCase());
    const wordFreq: Record<string, number> = {};

    // Tính tần suất xuất hiện của từ
    words.forEach((word) => {
      if (word.length > 3) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // Sắp xếp và lấy top từ khóa
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}
