import { ValidationException } from '@core/shared';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { TaskDao } from '../../../src/domain/task.dao';
import { buildTestTask, buildTestUser } from '../support/test-data-builders';
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

interface InsertedTaskRow {
  readonly id: string;
  readonly createdAt: Date;
}

/**
 * Inserts a row with an exact, caller-chosen `created_at` — `tasks` is not
 * partitioned, so unlike history rows there is no range to stay inside.
 * Raw SQL rather than `repository.save` so this test controls the ordering
 * key precisely instead of trusting whatever the ORM does with a
 * caller-supplied value on an auto-generated column.
 */
async function insertTaskAt(
  dataSource: DataSource,
  assignedUserId: string,
  createdAt: Date,
): Promise<InsertedTaskRow> {
  const rows: Array<{ id: string; created_at: Date }> = await dataSource.query(
    `INSERT INTO tasks (type, assigned_user_id, created_at) VALUES ($1, $2, $3) RETURNING id, created_at`,
    ['procurement', assignedUserId, createdAt],
  );
  const [row] = rows;

  if (!row) {
    throw new Error('INSERT ... RETURNING produced no row');
  }

  return { id: row.id, createdAt: row.created_at };
}

describeAgainstRealDatabase('TaskDao, Given:a reachable Postgres instance', () => {
  let testDatabase: TestDatabase;
  let taskDao: TaskDao;

  beforeAll(async () => {
    testDatabase = await setupTestDatabase();
    taskDao = new TaskDao(testDatabase.dataSource, testDatabase.dataSource);
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  describe('Given:a task row exists, When:getByIdForUpdate is called with its id', () => {
    it('should return the mapped Task domain model', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
      const user = await userRepository.save(buildTestUser());
      const savedTask = await taskRepository.save(
        buildTestTask(user.id, { customFields: { quote1: '100 USD' } }),
      );

      const task = await testDatabase.dataSource.transaction((manager) =>
        taskDao.getByIdForUpdate(savedTask.id, manager),
      );

      expect(task.id).toBe(savedTask.id);
      expect(task.type).toBe('procurement');
      expect(task.assignedUserId).toBe(user.id);
      expect(task.customFields).toEqual({ quote1: '100 USD' });
    });
  });

  describe('Given:no task with that id, When:getByIdForUpdate is called', () => {
    it('should throw NotFoundException', async () => {
      await expect(
        testDatabase.dataSource.transaction((manager) =>
          taskDao.getByIdForUpdate('00000000-0000-0000-0000-000000000000', manager),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Given:a task whose custom_fields already holds a prior value, When:a forward transition merges a new one in', () => {
    it('should round-trip the merged JSONB object', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
      const user = await userRepository.save(buildTestUser());
      const savedTask = await taskRepository.save(
        buildTestTask(user.id, { customFields: { quote1: '100 USD' } }),
      );

      await testDatabase.dataSource.transaction(async (manager) => {
        const existing = await taskDao.getByIdForUpdate(savedTask.id, manager);
        const merged = { ...existing.customFields, quote2: '150 USD' };

        await manager.update(TaskEntity, savedTask.id, { customFields: merged });
      });

      const reloaded = await testDatabase.dataSource.transaction((manager) =>
        taskDao.getByIdForUpdate(savedTask.id, manager),
      );

      expect(reloaded.customFields).toEqual({ quote1: '100 USD', quote2: '150 USD' });
    });
  });

  describe('Given:two concurrent transactions locking the same task, When:the first already holds the row lock', () => {
    it('should block the second until the first commits, and the second should then see the committed state', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
      const user = await userRepository.save(buildTestUser());
      const savedTask = await taskRepository.save(buildTestTask(user.id, { status: 1 }));

      const firstRunner = testDatabase.dataSource.createQueryRunner();
      const secondRunner = testDatabase.dataSource.createQueryRunner();

      await firstRunner.connect();
      await firstRunner.startTransaction();
      await secondRunner.connect();
      await secondRunner.startTransaction();

      try {
        await taskDao.getByIdForUpdate(savedTask.id, firstRunner.manager);

        let secondResolved = false;
        const secondCall = taskDao
          .getByIdForUpdate(savedTask.id, secondRunner.manager)
          .then((result) => {
            secondResolved = true;
            return result;
          });

        // Long enough for the second call to have resolved already if it were
        // not actually blocked behind the first transaction's row lock.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(secondResolved).toBe(false);

        await firstRunner.manager.update(TaskEntity, savedTask.id, { status: 2 });
        await firstRunner.commitTransaction();

        const secondResult = await secondCall;

        expect(secondResolved).toBe(true);
        expect(secondResult.status).toBe(2);

        await secondRunner.commitTransaction();
      } finally {
        await firstRunner.release();
        await secondRunner.release();
      }
    }, 10_000);
  });

  describe('Given:more tasks assigned to a user than fit on one page, When:paginating with a limit', () => {
    it('should return them newest-first and expose no next page once exhausted', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());

      const oldest = await insertTaskAt(
        testDatabase.dataSource,
        user.id,
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const middle = await insertTaskAt(
        testDatabase.dataSource,
        user.id,
        new Date('2026-01-02T00:00:00.000Z'),
      );
      const newest = await insertTaskAt(
        testDatabase.dataSource,
        user.id,
        new Date('2026-01-03T00:00:00.000Z'),
      );

      const page1 = await taskDao.findPageByAssignee(user.id, 2);
      expect(page1.items.map((task) => task.id)).toEqual([newest.id, middle.id]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await taskDao.findPageByAssignee(user.id, 2, page1.nextCursor ?? undefined);
      expect(page2.items.map((task) => task.id)).toEqual([oldest.id]);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('Given:several tasks sharing the exact same created_at right at a page boundary, When:paginating', () => {
    it('should serve every row exactly once across pages, in stable created_at/id DESC order', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());
      const sharedInstant = new Date('2026-02-01T12:00:00.000Z');

      await insertTaskAt(testDatabase.dataSource, user.id, sharedInstant);
      await insertTaskAt(testDatabase.dataSource, user.id, sharedInstant);
      await insertTaskAt(testDatabase.dataSource, user.id, sharedInstant);

      const expectedOrder: Array<{ id: string }> = await testDatabase.dataSource.query(
        `SELECT id FROM tasks WHERE assigned_user_id = $1 ORDER BY created_at DESC, id DESC`,
        [user.id],
      );

      const page1 = await taskDao.findPageByAssignee(user.id, 2);
      const page2 = await taskDao.findPageByAssignee(user.id, 2, page1.nextCursor ?? undefined);

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      const servedIds = [...page1.items, ...page2.items].map((task) => task.id);
      expect(servedIds).toEqual(expectedOrder.map((row) => row.id));
      expect(new Set(servedIds).size).toBe(3);
    });
  });

  describe('Given:a cursor that is not valid base64-encoded JSON, When:findPageByAssignee is called', () => {
    it('should throw ValidationException rather than query with it', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());

      await expect(taskDao.findPageByAssignee(user.id, 10, 'not-a-valid-cursor')).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:a cursor that decodes to well-formed JSON of the wrong shape, When:findPageByAssignee is called', () => {
    it('should throw ValidationException', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const user = await userRepository.save(buildTestUser());
      const wrongShapeCursor = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');

      await expect(taskDao.findPageByAssignee(user.id, 10, wrongShapeCursor)).rejects.toThrow(
        ValidationException,
      );
    });
  });
});
