import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Article } from './article.entity';
import { VietnamnetArticle } from 'src/vietnamnet/vietnamnetarticle.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => Article, (article) => article.category)
  articles: Article[];

  @OneToMany(() => VietnamnetArticle, (article) => article.category)
  vietnamnetArticles: VietnamnetArticle[];
}
