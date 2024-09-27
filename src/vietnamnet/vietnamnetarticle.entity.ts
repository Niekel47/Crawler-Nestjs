import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column()
  category: string;

  @Column({ nullable: true })
  imageUrl: string;
}
