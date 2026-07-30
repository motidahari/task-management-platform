import type { QueryRunner } from 'typeorm';

import { SeedUsers1700000000002 } from '../../../src/migrations/1700000000002-SeedUsers';

const DEMO_USER_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
];

function fakeQueryRunner(): { queryRunner: QueryRunner; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(undefined);

  return { queryRunner: { query } as unknown as QueryRunner, query };
}

function executedStatements(query: jest.Mock): string[] {
  return query.mock.calls.map(([sql]: [string]) => sql);
}

describe('SeedUsers1700000000002', () => {
  describe('Given:a fresh database, When:the migration runs up()', () => {
    it('should insert exactly the four demo users', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const statement = executedStatements(query).find((sql) => sql.includes('INSERT INTO users'));
      const rowCount = statement?.match(/\(\s*'[0-9a-f-]+',/g)?.length;

      expect(rowCount).toBe(4);
    });

    it('should insert each fixed demo user id', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const statement = executedStatements(query).find((sql) => sql.includes('INSERT INTO users'));

      DEMO_USER_IDS.forEach((id) => {
        expect(statement).toContain(id);
      });
    });

    it('should be idempotent via ON CONFLICT DO NOTHING on id', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().up(queryRunner);

      const statement = executedStatements(query).find((sql) => sql.includes('INSERT INTO users'));

      expect(statement).toContain('ON CONFLICT (id) DO NOTHING');
    });
  });

  describe('Given:a seeded database, When:the migration runs down()', () => {
    it('should delete exactly the four fixed demo user ids', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new SeedUsers1700000000002().down(queryRunner);

      const statement = executedStatements(query).find((sql) => sql.includes('DELETE FROM users'));

      DEMO_USER_IDS.forEach((id) => {
        expect(statement).toContain(id);
      });
    });
  });
});
