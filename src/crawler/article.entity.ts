import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column()
  publishDate: Date;

  @Column()
  category: string;

  @Column({ nullable: true })
  imageUrl: string;
}
