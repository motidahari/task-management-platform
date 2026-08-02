import type { QueryRunner } from 'typeorm';

import { SyncDemoUsers1700000000003 } from '../../../src/migrations/1700000000003-SyncDemoUsers';
import { COLUMNS_PER_ROW, DEMO_USERS } from '../../../src/migrations/support/demo-users';

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

describe('SyncDemoUsers1700000000003', () => {
  describe('Given:an environment already on an older demo-user roster, When:the migration runs up()', () => {
    it('should insert the full current roster, one row per entry', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SyncDemoUsers1700000000003().up(queryRunner);

      const [, params] = findCall(query, 'INSERT INTO users');
      const rowCount = (params ?? []).length / COLUMNS_PER_ROW;

      expect(rowCount).toBe(DEMO_USERS.length);
    });

    it('should pass every roster name and email as a query parameter, never interpolated into the SQL', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SyncDemoUsers1700000000003().up(queryRunner);

      const [statement, params] = findCall(query, 'INSERT INTO users');

      DEMO_USERS.forEach((user) => {
        expect(params).toContain(user.name);
        expect(params).toContain(user.email);
        expect(statement).not.toContain(user.email);
      });
    });

    it('should be idempotent via ON CONFLICT (email) DO NOTHING, so rows already seeded by the base migration are left untouched', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SyncDemoUsers1700000000003().up(queryRunner);

      const [statement] = findCall(query, 'INSERT INTO users');

      expect(statement).toContain('ON CONFLICT (email) DO NOTHING');
    });

    it('should never hand-write a uuid literal into the executed SQL', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SyncDemoUsers1700000000003().up(queryRunner);

      executedCalls(query).forEach(([statement]) => {
        expect(statement).not.toMatch(UUID_LITERAL_PATTERN);
      });
    });
  });

  describe('Given:an applied migration, When:it runs down()', () => {
    it('should not issue any query, leaving the base seed migration solely responsible for removing demo users', async () => {
      const { query } = fakeQueryRunner();

      await new SyncDemoUsers1700000000003().down();

      expect(query).not.toHaveBeenCalled();
    });
  });
});
