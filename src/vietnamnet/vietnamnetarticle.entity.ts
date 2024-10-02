import { Category } from 'src/models/category.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';

@Entity()
export class VietnamnetArticle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ unique: true })
  url: string;

  @Column()
  publishDate: Date;

  @ManyToOne(() => Category, (category) => category.vietnamnetArticles)
  category: Category;

  @Column({ nullable: true })
  imageUrl: string;
}
