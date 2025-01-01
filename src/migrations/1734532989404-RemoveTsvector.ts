import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTsvector1734532989404 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the tsvector column if it exists
    await queryRunner.query(
      `ALTER TABLE "article" DROP COLUMN IF EXISTS "searchVector"`,
    );

    // Create index on title column
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_article_title" ON "article" ("title")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_article_title"`);

    // Recreate the tsvector column
    await queryRunner.query(
      `ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "searchVector" tsvector`,
    );
  }
}
