import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixed, hand-picked UUIDs (not `gen_random_uuid()`) so every environment —
 * local, CI, staging — ends up with the same four user ids. That lets API
 * examples and client fixtures reference a user by id and stay valid
 * anywhere this migration has run.
 */
const DEMO_USERS = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Alice', email: 'alice@demo.local' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Bob', email: 'bob@demo.local' },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Carol', email: 'carol@demo.local' },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Dana', email: 'dana@demo.local' },
] as const;

/**
 * Seeds the four fixed-id demo users the API examples and client fixtures
 * key off of. Uses `ON CONFLICT (id) DO NOTHING` so re-running this
 * migration (or applying it against a database that already has the rows,
 * e.g. after a restore) never fails or duplicates data.
 */
export class SeedUsers1700000000002 implements MigrationInterface {
  name = 'SeedUsers1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const values = DEMO_USERS.map((user) => `('${user.id}', '${user.name}', '${user.email}')`).join(
      ',\n        ',
    );

    await queryRunner.query(`
      INSERT INTO users (id, name, email)
      VALUES
        ${values}
      ON CONFLICT (id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const ids = DEMO_USERS.map((user) => `'${user.id}'`).join(', ');

    await queryRunner.query(`DELETE FROM users WHERE id IN (${ids})`);
  }
}
