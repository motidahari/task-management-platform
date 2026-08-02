import { ValidationException } from '@core/shared';
import { DataSource } from 'typeorm';

import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { TaskStatusHistoryDao } from '../../../src/domain/task-status-history.dao';
import { buildTestHistoryEntry, buildTestTask, buildTestUser } from '../support/test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TestDatabase,
} from '../support/test-database';

/**
 * Runs only against a real Postgres instance reachable at `DB_URL` — skipped
 * entirely, rather than failed, when no database is configured for the local
 * run, the same convention every other integration suite in this service uses.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

interface InsertedHistoryRow {
  readonly id: string;
  readonly createdAt: Date;
}

/**
 * Inserts a row at an exact, caller-chosen `created_at`. Unlike `tasks`,
 * `task_status_history` is range-partitioned on `created_at` with no default
 * partition, so every timestamp used here must land inside a month the
 * migration already provisioned (the current month, since that always
 * exists) rather than an arbitrary date that could fall outside every
 * partition and fail the insert outright.
 */
async function insertHistoryAt(
  dataSource: DataSource,
  taskId: string,
  assignedUserId: string,
  toStatus: number,
  createdAt: Date,
): Promise<InsertedHistoryRow> {
  const rows: Array<{ id: string; created_at: Date }> = await dataSource.query(
    `INSERT INTO task_status_history (task_id, from_status, to_status, assigned_user_id, created_at)
     VALUES ($1, NULL, $2, $3, $4) RETURNING id, created_at`,
    [taskId, toStatus, assignedUserId, createdAt],
  );
  const [row] = rows;

  if (!row) {
    throw new Error('INSERT ... RETURNING produced no row');
  }

  return { id: row.id, createdAt: row.created_at };
}

/** A timestamp guaranteed to fall inside the current month's partition, whatever day the suite runs on. */
function withinCurrentPartition(offsetMs: number): Date {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  return new Date(startOfMonth.getTime() + offsetMs);
}

describeAgainstRealDatabase('TaskStatusHistoryDao, Given:a reachable Postgres instance', () => {
  let testDatabase: TestDatabase;
  let historyDao: TaskStatusHistoryDao;

  beforeAll(async () => {
    testDatabase = await setupTestDatabase();
    historyDao = new TaskStatusHistoryDao(testDatabase.dataSource, testDatabase.dataSource);
  });

  beforeEach(async () => {
    await testDatabase.openLedger();
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  async function createTestTask(): Promise<{ userId: string; taskId: string }> {
    const userRepository = testDatabase.dataSource.getRepository(UserEntity);
    const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
    const user = await userRepository.save(buildTestUser());
    const task = await taskRepository.save(buildTestTask(user.id));

    return { userId: user.id, taskId: task.id };
  }

  describe('Given:a history row with a fields snapshot, When:findPageByTask reads it back', () => {
    it('should round-trip the JSONB snapshot and every other column', async () => {
      const historyRepository = testDatabase.dataSource.getRepository(TaskStatusHistoryEntity);
      const { userId, taskId } = await createTestTask();
      await historyRepository.save(
        buildTestHistoryEntry(taskId, userId, {
          fromStatus: null,
          toStatus: 1,
          fieldsSnapshot: { quote1: '100 USD' },
        }),
      );

      const page = await historyDao.findPageByTask(taskId, 10);

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        taskId,
        assignedUserId: userId,
        fromStatus: null,
        toStatus: 1,
        fieldsSnapshot: { quote1: '100 USD' },
      });
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('Given:more history rows for a task than fit on one page, When:paginating with a limit', () => {
    it('should return them oldest-first and expose no next page once exhausted', async () => {
      const { userId, taskId } = await createTestTask();

      const creation = await insertHistoryAt(
        testDatabase.dataSource,
        taskId,
        userId,
        1,
        withinCurrentPartition(0),
      );
      const secondTransition = await insertHistoryAt(
        testDatabase.dataSource,
        taskId,
        userId,
        2,
        withinCurrentPartition(1000),
      );
      const thirdTransition = await insertHistoryAt(
        testDatabase.dataSource,
        taskId,
        userId,
        3,
        withinCurrentPartition(2000),
      );

      const page1 = await historyDao.findPageByTask(taskId, 2);
      expect(page1.items.map((entry) => entry.id)).toEqual([creation.id, secondTransition.id]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await historyDao.findPageByTask(taskId, 2, page1.nextCursor ?? undefined);
      expect(page2.items.map((entry) => entry.id)).toEqual([thirdTransition.id]);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('Given:several history rows sharing the exact same created_at right at a page boundary, When:paginating', () => {
    it('should serve every row exactly once across pages, in stable created_at/id ASC order', async () => {
      const { userId, taskId } = await createTestTask();
      const sharedInstant = withinCurrentPartition(0);

      await insertHistoryAt(testDatabase.dataSource, taskId, userId, 1, sharedInstant);
      await insertHistoryAt(testDatabase.dataSource, taskId, userId, 2, sharedInstant);
      await insertHistoryAt(testDatabase.dataSource, taskId, userId, 3, sharedInstant);

      const expectedOrder: Array<{ id: string }> = await testDatabase.dataSource.query(
        `SELECT id FROM task_status_history WHERE task_id = $1 ORDER BY created_at ASC, id ASC`,
        [taskId],
      );

      const page1 = await historyDao.findPageByTask(taskId, 2);
      const page2 = await historyDao.findPageByTask(taskId, 2, page1.nextCursor ?? undefined);

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      const servedIds = [...page1.items, ...page2.items].map((entry) => entry.id);
      expect(servedIds).toEqual(expectedOrder.map((row) => row.id));
      expect(new Set(servedIds).size).toBe(3);
    });
  });

  describe('Given:a cursor that is not valid base64-encoded JSON, When:findPageByTask is called', () => {
    it('should throw ValidationException rather than query with it', async () => {
      const { taskId } = await createTestTask();

      await expect(historyDao.findPageByTask(taskId, 10, 'not-a-valid-cursor')).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
