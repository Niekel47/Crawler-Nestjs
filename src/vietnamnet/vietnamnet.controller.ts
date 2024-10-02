import { Controller, Get, Param } from '@nestjs/common';
import { VietnamnetService } from './vietnamnet.service';

@Controller('vietnamnet')
export class VietnamnetController {
  constructor(private readonly vietnamnetService: VietnamnetService) {}

  @Get('articles')
  getArticles() {
    return this.vietnamnetService.getArticles();
  }

  @Get('articles/:id')
  getArticleById(@Param('id') id: string) {
    return this.vietnamnetService.getArticleById(Number(id));
  }

  @Get('articles/category/:category')
  getArticlesByCategory(@Param('category') category: string) {
    return this.vietnamnetService.getArticlesByCategory(category);
  }
}
