import type { QueryRunner } from 'typeorm';

import { InitSchema1700000000001 } from '../../../src/migrations/1700000000001-InitSchema';

function fakeQueryRunner(): { queryRunner: QueryRunner; query: jest.Mock } {
  const query = jest.fn().mockResolvedValue(undefined);

  return { queryRunner: { query } as unknown as QueryRunner, query };
}

function executedStatements(query: jest.Mock): string[] {
  return query.mock.calls.map(([sql]: [string]) => sql);
}

describe('InitSchema1700000000001', () => {
  describe('Given:a fresh database, When:the migration runs up()', () => {
    it('should create the users, tasks and task_status_history tables', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const statements = executedStatements(query).join('\n');

      expect(statements).toMatch(/CREATE TABLE users/);
      expect(statements).toMatch(/CREATE TABLE tasks/);
      expect(statements).toMatch(/CREATE TABLE task_status_history/);
    });

    it('should partition task_status_history by range on created_at with a composite primary key', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const historyTableStatement = executedStatements(query).find((sql) =>
        sql.includes('CREATE TABLE task_status_history ('),
      );

      expect(historyTableStatement).toContain('PARTITION BY RANGE (created_at)');
      expect(historyTableStatement).toContain('PRIMARY KEY (id, created_at)');
    });

    it('should reject rows where both from_status and to_status are null', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const historyTableStatement = executedStatements(query).find((sql) =>
        sql.includes('CREATE TABLE task_status_history ('),
      );

      expect(historyTableStatement).toContain(
        'CHECK (NOT (from_status IS NULL AND to_status IS NULL))',
      );
    });

    it('should enforce status >= 1 on tasks', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const tasksTableStatement = executedStatements(query).find((sql) =>
        sql.includes('CREATE TABLE tasks ('),
      );

      expect(tasksTableStatement).toContain('CHECK (status >= 1)');
    });

    it('should create the all-DESC keyset index and its open-tasks partial variant', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const statements = executedStatements(query);
      const pageIndexStatement = statements.find((sql) => sql.includes('idx_tasks_assignee_page'));

      expect(pageIndexStatement).toContain('ON tasks (assigned_user_id, created_at DESC, id DESC)');
      expect(pageIndexStatement).not.toContain('WHERE');

      const partialIndexStatement = statements.find((sql) => sql.includes('idx_tasks_assignee_open'));

      expect(partialIndexStatement).toContain('assigned_user_id, created_at DESC, id DESC');
      expect(partialIndexStatement).toContain('WHERE is_closed = false');
    });

    it('should create the type index and the history timeline index including id', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const statements = executedStatements(query);

      expect(statements.some((sql) => sql.includes('idx_tasks_type ON tasks (type)'))).toBe(true);

      const historyIndexStatement = statements.find((sql) => sql.includes('idx_history_task'));

      expect(historyIndexStatement).toContain('ON task_status_history (task_id, created_at, id)');
    });

    it('should create exactly the current month plus 3 future monthly partitions, with no DEFAULT partition', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const partitionStatements = executedStatements(query).filter((sql) =>
        sql.includes('PARTITION OF task_status_history'),
      );

      expect(partitionStatements).toHaveLength(4);
      expect(
        partitionStatements.some((sql) => sql.toLowerCase().includes('default')),
      ).toBe(false);
    });

    it('should declare the FKs from tasks and task_status_history to users, and cascade task_status_history from tasks', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().up(queryRunner);

      const statements = executedStatements(query);
      const tasksTableStatement = statements.find((sql) => sql.includes('CREATE TABLE tasks ('));
      const historyTableStatement = statements.find((sql) =>
        sql.includes('CREATE TABLE task_status_history ('),
      );

      expect(tasksTableStatement).toContain('REFERENCES users (id)');
      expect(historyTableStatement).toContain('task_id uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE');
      expect(historyTableStatement).toContain('assigned_user_id uuid NOT NULL REFERENCES users (id)');
    });
  });

  describe('Given:an applied migration, When:it runs down()', () => {
    it('should drop task_status_history before tasks, and tasks before users, respecting FK order', async () => {
      const { queryRunner, query } = fakeQueryRunner();

      await new InitSchema1700000000001().down(queryRunner);

      const statements = executedStatements(query);

      expect(statements).toEqual([
        'DROP TABLE IF EXISTS task_status_history',
        'DROP TABLE IF EXISTS tasks',
        'DROP TABLE IF EXISTS users',
      ]);
    });
  });
});
