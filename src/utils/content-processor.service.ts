import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';

@Injectable()
export class ContentProcessorService {
  private openai: OpenAI;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  cleanHtml(html: string): string {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $(
      'script, style, iframe, nav, header, footer, .advertisement, em',
    ).remove();

    // Get text content
    const text = $('body').text();

    // Clean up whitespace
    return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
  }

  async summarizeContent(content: string): Promise<string> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that summarizes news articles. Provide a concise summary in Vietnamese.',
            },
            {
              role: 'user',
              content: `Summarize this article in Vietnamese (keep it under 200 words): ${content}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });

        return completion.choices[0].message.content.trim();
      } catch (error) {
        retries++;
        if (retries === this.maxRetries) {
          const words = content.split(' ');
          const summary = words.slice(0, 50).join(' ') + '...';
          return summary;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelay * retries),
        );
        return content.substring(0, 200) + '...';
      }
    }
  }
}
