import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as vntk from 'vntk';

@Injectable()
export class ContentClassificationService {
  private readonly logger = new Logger(ContentClassificationService.name);
  private readonly wordTokenizer;
  private readonly posTag;

  // Danh sách các chủ đề chính
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

  // Từ khóa đặc trưng cho mỗi chủ đề
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

  constructor(private readonly configService: ConfigService) {
    this.wordTokenizer = vntk.wordTokenizer();
    this.posTag = vntk.posTag();
  }

  // Phân loại nội dung dựa trên từ khóa và machine learning
  async classifyContent(text: string): Promise<string[]> {
    try {
      const tokens = this.wordTokenizer.tag(text.toLowerCase());
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

      // Lấy top 3 chủ đề có điểm cao nhất
      const topCategories = Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => this.MAIN_CATEGORIES[category]);

      return topCategories.length > 0 ? topCategories : ['Chưa phân loại'];
    } catch (error) {
      this.logger.error('Lỗi khi phân loại nội dung:', error.stack);
      return ['Chưa phân loại'];
    }
  }

  // Tạo tags cho bài viết
  async generateTags(text: string): Promise<string[]> {
    try {
      const posTags = this.posTag.tag(text);
      const tags = new Set<string>();

      // Xử lý các cụm từ có ý nghĩa
      for (let i = 0; i < posTags.length - 1; i++) {
        const [word, tag] = posTags[i];
        const nextTag = posTags[i + 1]?.[1];

        // Chọn các cụm danh từ và tính từ có ý nghĩa
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

      return Array.from(tags).slice(0, 10); // Giới hạn 10 tags
    } catch (error) {
      this.logger.error('Lỗi khi tạo tags:', error.stack);
      return [];
    }
  }

  // Phân tích xu hướng nội dung
  async analyzeTrends(articles: any[]): Promise<any> {
    try {
      const trends = {
        categories: new Map<string, number>(),
        topics: new Map<string, number>(),
        keywords: new Map<string, number>(),
        timeDistribution: new Map<string, number>(),
      };

      for (const article of articles) {
        // Phân tích phân bố thời gian
        if (article.publishDate) {
          const date = new Date(article.publishDate)
            .toISOString()
            .split('T')[0];
          trends.timeDistribution.set(
            date,
            (trends.timeDistribution.get(date) || 0) + 1,
          );
        }

        // Đếm số lượng bài viết theo chủ đề
        if (article.categories) {
          article.categories.forEach((category) => {
            trends.categories.set(
              category,
              (trends.categories.get(category) || 0) + 1,
            );
          });
        }

        // Phân tích từ khóa và chủ đề phổ biến
        if (article.topics) {
          article.topics.forEach((topic) => {
            trends.topics.set(topic, (trends.topics.get(topic) || 0) + 1);
          });
        }

        if (article.keywords) {
          article.keywords.forEach((keyword) => {
            trends.keywords.set(
              keyword,
              (trends.keywords.get(keyword) || 0) + 1,
            );
          });
        }
      }

      // Chuyển đổi Map thành object có sắp xếp
      return {
        categories: this.sortMapToObject(trends.categories),
        topics: this.sortMapToObject(trends.topics),
        keywords: this.sortMapToObject(trends.keywords),
        timeDistribution: Object.fromEntries(trends.timeDistribution),
      };
    } catch (error) {
      this.logger.error('Lỗi khi phân tích xu hướng:', error.stack);
      return null;
    }
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'là',
      'và',
      'của',
      'có',
      'được',
      'trong',
      'để',
      'với',
      'các',
      'những',
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private sortMapToObject(map: Map<string, number>): Record<string, number> {
    return Object.fromEntries(
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20),
    );
  }
}
