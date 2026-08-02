import type { QueryRunner } from 'typeorm';

import { SeedUsers1700000000002 } from '../../../src/migrations/1700000000002-SeedUsers';

const DEMO_USER_EMAILS = [
  'alice@demo.local',
  'bob@demo.local',
  'carol@demo.local',
  'dana@demo.local',
];

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
    it('should insert exactly four rows', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [, params] = findCall(query, 'INSERT INTO users');
      const columnsPerRow = 2;

      expect((params ?? []).length / columnsPerRow).toBe(4);
    });

    it('should pass each seeded email as a query parameter, not interpolated into the SQL', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [statement, params] = findCall(query, 'INSERT INTO users');

      DEMO_USER_EMAILS.forEach((email) => {
        expect(params).toContain(email);
        expect(statement).not.toContain(email);
      });
    });

    it('should be idempotent via ON CONFLICT (email) DO NOTHING', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const [statement] = findCall(query, 'INSERT INTO users');

      expect(statement).toContain('ON CONFLICT (email) DO NOTHING');
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
    it('should delete exactly the seeded demo user emails, passed as a query parameter', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().down(queryRunner);

      const [statement, params] = findCall(query, 'DELETE FROM users');

      expect(params).toEqual([DEMO_USER_EMAILS]);
      expect(statement).not.toMatch(UUID_LITERAL_PATTERN);
    });
  });
});
