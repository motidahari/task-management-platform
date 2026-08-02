import { QueryRunner } from 'typeorm';

/**
 * Demo users seeded into every environment. `id` is left to the column's
 * `gen_random_uuid()` default, so `email` — already unique-indexed — is the
 * row's stable identity. That makes seeding idempotent on email rather than
 * on a hand-picked id, and it means a client learns a seeded user's id by
 * calling `GET /users`, never by hard-coding one.
 *
 * Single source of truth shared by every migration that seeds or converges
 * demo users, so the roster can only grow in one place. Lives under
 * `support/`, outside the migrations directory's own glob, so its exported
 * helper functions are never mistaken for migration classes and instantiated
 * as one.
 */
export const DEMO_USERS = [
  { name: 'Alice', email: 'alice@demo.local' },
  { name: 'Bob', email: 'bob@demo.local' },
  { name: 'Carol', email: 'carol@demo.local' },
  { name: 'Dana', email: 'dana@demo.local' },
  { name: 'Ethan', email: 'ethan@demo.local' },
  { name: 'Fiona', email: 'fiona@demo.local' },
  { name: 'Gavin', email: 'gavin@demo.local' },
  { name: 'Hannah', email: 'hannah@demo.local' },
  { name: 'Ivan', email: 'ivan@demo.local' },
  { name: 'Julia', email: 'julia@demo.local' },
  { name: 'Kevin', email: 'kevin@demo.local' },
  { name: 'Laura', email: 'laura@demo.local' },
  { name: 'Marcus', email: 'marcus@demo.local' },
  { name: 'Nadia', email: 'nadia@demo.local' },
  { name: 'Oscar', email: 'oscar@demo.local' },
  { name: 'Priya', email: 'priya@demo.local' },
  { name: 'Quinn', email: 'quinn@demo.local' },
  { name: 'Rachel', email: 'rachel@demo.local' },
  { name: 'Samuel', email: 'samuel@demo.local' },
  { name: 'Tara', email: 'tara@demo.local' },
  { name: 'Umar', email: 'umar@demo.local' },
  { name: 'Vera', email: 'vera@demo.local' },
] as const;

export const COLUMNS_PER_ROW = 2;

/**
 * Inserts every demo user, tolerant of rows that already exist (`email` is
 * unique-indexed). Parameterized, never interpolated, and safe to call from
 * more than one migration against the same database — each call converges
 * the table towards the full `DEMO_USERS` roster without duplicating rows.
 */
export async function insertDemoUsers(queryRunner: QueryRunner): Promise<void> {
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

/**
 * Deletes exactly the demo user rows this module seeds, identified by email.
 */
export async function deleteDemoUsers(queryRunner: QueryRunner): Promise<void> {
  const emails = DEMO_USERS.map((user) => user.email);

  await queryRunner.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
}
