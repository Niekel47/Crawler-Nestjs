import { Controller, Get } from '@nestjs/common';
import { VietnamnetService } from './vietnamnet.service';

@Controller('vietnamnet')
export class VietnamnetController {
  constructor(private readonly vietnamnetService: VietnamnetService) {}

  @Get('articles')
  getArticles() {
    return this.vietnamnetService.getArticles();
  }
}
