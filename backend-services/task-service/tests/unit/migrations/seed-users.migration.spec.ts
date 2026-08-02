import type { QueryRunner } from 'typeorm';

import { SeedUsers1700000000002 } from '../../../src/migrations/1700000000002-SeedUsers';
import { COLUMNS_PER_ROW, DEMO_USERS } from '../../../src/migrations/support/demo-users';

const MIN_SEEDED_USER_COUNT = 20;
const DEMO_USER_EMAILS = DEMO_USERS.map((user) => user.email);

const UUID_LITERAL_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function fakeQueryRunner(): { queryRunner: QueryRunner; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(undefined);

  return { queryRunner: { query } as unknown as QueryRunner, query };
}

function executedCalls(query: jest.Mock): [sql: string, params: unknown[] | undefined][] {
  return query.mock.calls as [sql: string, params: unknown[] | undefined][];
}

function findCall(
  query: jest.Mock,
  sqlFragment: string,
): [sql: string, params: unknown[] | undefined] {
  const call = executedCalls(query).find(([sql]) => sql.includes(sqlFragment));

  if (!call) {
    throw new Error(`no executed statement contains "${sqlFragment}"`);
  }

  return call;
}

describe('SeedUsers1700000000002', () => {
  describe('Given:a fresh database, When:the migration runs up()', () => {
    it('should seed at least 20 demo users, one row per entry in the shared roster', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [, params] = findCall(query, 'INSERT INTO users');
      const rowCount = (params ?? []).length / COLUMNS_PER_ROW;

      expect(DEMO_USERS.length).toBeGreaterThanOrEqual(MIN_SEEDED_USER_COUNT);
      expect(rowCount).toBe(DEMO_USERS.length);
    });

    it('should emit every roster email exactly once, each ending in @demo.local', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [, params] = findCall(query, 'INSERT INTO users');
      const emittedEmails = (params ?? []).filter(
        (value): value is string => typeof value === 'string' && value.endsWith('@demo.local'),
      );

      expect(emittedEmails).toEqual(DEMO_USER_EMAILS);
      expect(new Set(emittedEmails).size).toBe(emittedEmails.length);
    });

    it('should pass every seeded name and email as a query parameter, never interpolated into the SQL', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [statement, params] = findCall(query, 'INSERT INTO users');

      DEMO_USERS.forEach((user) => {
        expect(params).toContain(user.name);
        expect(params).toContain(user.email);
        expect(statement).not.toContain(user.email);
      });
    });

    it('should be idempotent via ON CONFLICT (email) DO NOTHING, unchanged on a second run', async () => {
      const { queryRunner, query } = fakeQueryRunner();
      const migration = new SeedUsers1700000000002();

      await migration.up(queryRunner);
      await migration.up(queryRunner);

      const calls = executedCalls(query);

      expect(calls).toHaveLength(2);
      calls.forEach(([statement]) => {
        expect(statement).toContain('ON CONFLICT (email) DO NOTHING');
      });
      expect(calls[1]).toEqual(calls[0]);
    });

    it('should never hand-write a uuid literal into the executed SQL', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      executedCalls(query).forEach(([statement]) => {
        expect(statement).not.toMatch(UUID_LITERAL_PATTERN);
      });
    });
  });

  describe('Given:a seeded database, When:the migration runs down()', () => {
    it('should delete exactly the roster emails, passed as a query parameter', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().down(queryRunner);

      const [statement, params] = findCall(query, 'DELETE FROM users');

      expect(params).toEqual([DEMO_USER_EMAILS]);
      expect(statement).not.toMatch(UUID_LITERAL_PATTERN);
    });
  });
});
