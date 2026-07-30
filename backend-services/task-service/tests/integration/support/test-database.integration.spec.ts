import { Like } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { buildTestHistoryEntry, buildTestTask, buildTestUser } from './test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TEST_RECORD_PREFIX,
  TestDatabase,
} from './test-database';

/**
 * Every other integration suite in this service trusts `setupTestDatabase`
 * / `cleanupTestDatabase` to materialize the schema and leave no residue
 * behind — this suite is that contract's own coverage, independent of any
 * one consumer. Skipped, not failed, when no database is configured for the
 * local run — the same convention the partition-maintenance integration
 * spec uses.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

describeAgainstRealDatabase(
  'Integration test database helper, Given:a reachable Postgres instance',
  () => {
    let testDatabase: TestDatabase;

    beforeAll(async () => {
      testDatabase = await setupTestDatabase();
    });

    afterEach(async () => {
      await testDatabase.cleanup();
    });

    afterAll(async () => {
      await testDatabase.teardown();
    });

    describe('When:the helper connects and replays the migrations', () => {
      it('should materialize every table the app migrations ship', async () => {
        const tables: Array<{ table_name: string }> = await testDatabase.dataSource.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('users', 'tasks', 'task_status_history')
      `);

        expect(tables.map((table) => table.table_name).sort()).toEqual([
          'task_status_history',
          'tasks',
          'users',
        ]);
      });
    });

    describe('Given:prefixed users, tasks and history rows exist, When:cleanup runs', () => {
      it('should delete every prefixed row across all three tables, respecting FK order', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
        const historyRepository = testDatabase.dataSource.getRepository(TaskStatusHistoryEntity);

        const user = await userRepository.save(buildTestUser());
        const task = await taskRepository.save(buildTestTask(user.id));
        await historyRepository.save(buildTestHistoryEntry(task.id, user.id));

        await testDatabase.cleanup();

        const prefixFilter = { where: { email: Like(`${TEST_RECORD_PREFIX}%`) } };
        await expect(userRepository.count(prefixFilter)).resolves.toBe(0);
        await expect(taskRepository.count({ where: { assignedUserId: user.id } })).resolves.toBe(0);
        await expect(historyRepository.count({ where: { taskId: task.id } })).resolves.toBe(0);
      });

      it('should leave rows without the reserved prefix untouched', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const unrelatedUser = await userRepository.save(
          buildTestUser({ name: 'Non-Test Bystander', email: 'bystander@example.com' }),
        );

        try {
          await testDatabase.cleanup();

          await expect(userRepository.exists({ where: { id: unrelatedUser.id } })).resolves.toBe(
            true,
          );
        } finally {
          await userRepository.delete({ id: unrelatedUser.id });
        }
      });
    });

    describe('Given:an initialized connection, When:teardown runs', () => {
      it('should close the DataSource', async () => {
        const scopedDatabase = await setupTestDatabase();

        await scopedDatabase.teardown();

        expect(scopedDatabase.dataSource.isInitialized).toBe(false);
      });
    });
  },
);
