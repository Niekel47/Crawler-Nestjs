import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Category } from './category.entity';

@Entity()
export class Article {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('text')
  content: string;

  @Column({ unique: true })
  url: string;

  @Column({ type: 'timestamp' })
  publishDate: Date;

  @ManyToOne(() => Category, (category) => category.articles)
  category: Category;

  @Column({ nullable: true })
  imageUrl: string;

  @Column()
  source: string;
}
