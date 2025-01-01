import { Controller, Get } from '@nestjs/common';
import { TwentyFourHService } from './24h.service';

@Controller('24h')
export class TwentyFourHController {
  constructor(private readonly twentyFourHService: TwentyFourHService) {}

  @Get('articles')
  getArticles() {
    return this.twentyFourHService.getArticles();
  }
}
