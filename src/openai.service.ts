import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Bottleneck from 'bottleneck'; // Thêm import này

@Injectable()
export class OpenAIService {
  private openai: OpenAI;
  private limiter: Bottleneck;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    // Khởi tạo bottleneck limiter
    this.limiter = new Bottleneck({
      maxConcurrent: 1, // Số request đồng thời tối đa
      minTime: 1000, // Thời gian tối thiểu giữa các request (ms)
      reservoir: 50, // Số request tối đa trong một khoảng thời gian
      reservoirRefreshAmount: 50, // Số request được refresh
      reservoirRefreshInterval: 60 * 1000, // Thời gian refresh reservoir (60 giây)
    });

    // Thêm event listeners để theo dõi limiter
    this.limiter.on('failed', async (error, jobInfo) => {
      console.warn(`Job ${jobInfo.options.id} failed: ${error}`);
      if (jobInfo.retryCount < 3) {
        console.log(`Retrying job ${jobInfo.options.id}`);
        return 2000; // Đợi 2 giây trước khi retry
      }
    });

    this.limiter.on('depleted', () => {
      console.warn('Rate limit depleted, waiting for refresh...');
    });
  }

  private async handleOpenAIRequest<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.limiter.schedule(async () => {
      try {
        return await operation();
      } catch (error) {
        if (error.status === 429) {
          console.warn(
            'OpenAI rate limit reached, request will be retried automatically',
          );
        }
        throw error;
      }
    });
  }

  async summarizeArticle(content: string): Promise<string> {
    try {
      return await this.handleOpenAIRequest(async () => {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Summarize the following article:\n\n${content}\n\nSummary:`,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        });
        return response.choices[0].message.content.trim();
      });
    } catch (error) {
      console.error('Error summarizing article:', error);
      return 'Error generating summary';
    }
  }

  async analyzeArticle(content: string): Promise<{ score: number }> {
    try {
      return await this.handleOpenAIRequest(async () => {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Rate this article from 1-10 based on relevance:\n\n${content}\n\nScore:`,
            },
          ],
          max_tokens: 10,
          temperature: 0.1,
        });
        const score = parseInt(response.choices[0].message.content.trim());
        return { score: isNaN(score) ? 5 : score };
      });
    } catch (error) {
      console.error('Error analyzing article:', error);
      return { score: 5 };
    }
  }
}
