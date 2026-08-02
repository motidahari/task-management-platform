import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Demo users seeded into every environment. `id` is left to the column's
 * `gen_random_uuid()` default, so `email` — already unique-indexed — is the
 * row's stable identity. That makes this migration idempotent on email
 * rather than on a hand-picked id, and it means a client learns a seeded
 * user's id by calling `GET /users`, never by hard-coding one.
 */
const DEMO_USERS = [
  { name: 'Alice', email: 'alice@demo.local' },
  { name: 'Bob', email: 'bob@demo.local' },
  { name: 'Carol', email: 'carol@demo.local' },
  { name: 'Dana', email: 'dana@demo.local' },
] as const;

const COLUMNS_PER_ROW = 2;

export class SeedUsers1700000000002 implements MigrationInterface {
  name = 'SeedUsers1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const placeholders = DEMO_USERS.map(
      (_user, index) => `($${index * COLUMNS_PER_ROW + 1}, $${index * COLUMNS_PER_ROW + 2})`,
    ).join(',\n        ');
    const params = DEMO_USERS.flatMap((user) => [user.name, user.email]);

    await queryRunner.query(
      `
      INSERT INTO users (name, email)
      VALUES
        ${placeholders}
      ON CONFLICT (email) DO NOTHING
    `,
      params,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emails = DEMO_USERS.map((user) => user.email);

    await queryRunner.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  }
}
