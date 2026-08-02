import { DataSource, Like } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { buildTestHistoryEntry, buildTestTask, buildTestUser } from './test-data-builders';
import {
  cleanupTestDatabase,
  isTestDatabaseConfigured,
  setupTestDatabase,
  TEST_RECORD_LIKE_PATTERN,
  TEST_RECORD_PREFIX,
  useTestDatabase,
} from './test-database';
import { isLedgerAuditInstalled } from './test-database-ledger';

/**
 * Every other database-backed suite in this service trusts the helper to
 * materialize the schema, undo what the test wrote and leave everything else —
 * other sessions' rows, and the schema itself — exactly as it was. This suite
 * is that contract's own coverage, independent of any one consumer. Skipped,
 * not failed, when no database is configured for the local run.
 *
 * Two rules shape what is written here. First, the fixtures only make writes
 * this system can actually make: a task created, advanced, reversed or closed,
 * each with the history row that records it. `users` is seed-only — nothing in
 * the API or the UI writes one — so no fixture pretends otherwise, and the
 * `users` rows that do appear are written the way the seed migration writes
 * them, as data to hang tasks off rather than as a user-facing action.
 *
 * Second, what a test is entitled to assert is narrow: that its own inserts
 * left no row behind, and that the columns it changed are back to what they
 * held. Never that the database as a whole is unchanged — another session
 * writing to it at the same time is the scenario this helper exists to survive,
 * so an assertion forbidding it would assert the opposite of the contract.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

type LedgeredTableName = 'users' | 'tasks' | 'task_status_history';

/** One row, addressed the way a test names the rows it is accountable for. `id` is unique in all three tables. */
interface RowAddress {
  readonly table: LedgeredTableName;
  readonly id: string;
}

interface CreatedTask {
  readonly taskId: string;
  readonly historyId: string;
}

/** One forward or backward move, carrying everything the service writes with it. */
interface TaskTransition {
  readonly fromStatus: number;
  readonly toStatus: number;
  readonly assignedUserId: string;
  readonly customFields: Record<string, unknown>;
}

/**
 * Creating a task, as the service does it: the row, and the creation entry that
 * records it, in the one place both are written.
 */
async function createTask(dataSource: DataSource, assignedUserId: string): Promise<CreatedTask> {
  const taskId = requireInsertedId(
    await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO tasks (type, assigned_user_id) VALUES ($1, $2) RETURNING id`,
      ['procurement', assignedUserId],
    ),
  );
  const historyId = requireInsertedId(
    await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO task_status_history (task_id, from_status, to_status, assigned_user_id, fields_snapshot)
       VALUES ($1, NULL, 1, $2, '{}'::jsonb) RETURNING id`,
      [taskId, assignedUserId],
    ),
  );

  return { taskId, historyId };
}

/**
 * Advancing or reversing a task: the single `UPDATE` a status change makes, and
 * the history row appended alongside it. `updated_at` is set explicitly because
 * the service's own write does too — which is what makes it the column two
 * concurrent writers always collide on.
 */
async function advanceTask(
  dataSource: DataSource,
  taskId: string,
  transition: TaskTransition,
): Promise<string> {
  await dataSource.query(
    `UPDATE tasks SET status = $2, assigned_user_id = $3, custom_fields = $4, updated_at = now()
     WHERE id = $1`,
    [taskId, transition.toStatus, transition.assignedUserId, transition.customFields],
  );

  return requireInsertedId(
    await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO task_status_history (task_id, from_status, to_status, assigned_user_id, fields_snapshot)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        taskId,
        transition.fromStatus,
        transition.toStatus,
        transition.assignedUserId,
        transition.customFields,
      ],
    ),
  );
}

/** Closing a task: `is_closed` alone changes — closing is not a status change — plus the entry recording it. */
async function closeTask(
  dataSource: DataSource,
  taskId: string,
  closure: { fromStatus: number; assignedUserId: string },
): Promise<string> {
  await dataSource.query(`UPDATE tasks SET is_closed = true, updated_at = now() WHERE id = $1`, [
    taskId,
  ]);

  return requireInsertedId(
    await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO task_status_history (task_id, from_status, to_status, assigned_user_id, fields_snapshot)
       VALUES ($1, $2, NULL, $3, '{}'::jsonb) RETURNING id`,
      [taskId, closure.fromStatus, closure.assignedUserId],
    ),
  );
}

/**
 * A connection the ledger never marked — the shape of every session that is not
 * this run: the backend's own pool behind a developer's browser, a `psql`
 * window, or a suite running out of another worktree. Writes made over it are
 * the ones a restore must never be able to name.
 *
 * It can do the three things a person can actually do to this data, and nothing
 * else. Every statement it issues names one row by primary key, and
 * {@link close} removes exactly the rows it inserted — so no test can reach for
 * an unqualified `DELETE` to tidy up after itself. A fixture that writes outside
 * the ledger's reach is also outside the ledger's undo, which would make
 * "delete everything in the table" unrecoverable rather than merely untidy.
 */
class ForeignSession {
  private readonly insertedTaskIds: string[] = [];
  private readonly insertedHistoryIds: string[] = [];

  private constructor(private readonly dataSource: DataSource) {}

  static async open(): Promise<ForeignSession> {
    const dataSource = new DataSource({ type: 'postgres', url: process.env.DB_URL, entities: [] });

    await dataSource.initialize();

    return new ForeignSession(dataSource);
  }

  async createTask(assignedUserId: string): Promise<CreatedTask> {
    const created = await createTask(this.dataSource, assignedUserId);

    this.insertedTaskIds.push(created.taskId);
    this.insertedHistoryIds.push(created.historyId);

    return created;
  }

  async advanceTask(taskId: string, transition: TaskTransition): Promise<void> {
    this.insertedHistoryIds.push(await advanceTask(this.dataSource, taskId, transition));
  }

  async closeTask(
    taskId: string,
    closure: { fromStatus: number; assignedUserId: string },
  ): Promise<void> {
    this.insertedHistoryIds.push(await closeTask(this.dataSource, taskId, closure));
  }

  async readTaskColumn(taskId: string, column: string): Promise<unknown> {
    return readColumnAt(this.dataSource, { table: 'tasks', id: taskId }, column);
  }

  async countHistoryOfTask(taskId: string): Promise<number> {
    const rows = await this.dataSource.query<Array<{ entries: number }>>(
      `SELECT count(*)::int AS entries FROM task_status_history WHERE task_id = $1`,
      [taskId],
    );

    return rows[0]?.entries ?? 0;
  }

  /** Removes the rows this session inserted, by primary key, children before parents — then disconnects. */
  async close(): Promise<void> {
    await this.deleteById('task_status_history', this.insertedHistoryIds);
    await this.deleteById('tasks', this.insertedTaskIds);
    await this.dataSource.destroy();
  }

  private async deleteById(table: LedgeredTableName, ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.dataSource.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    }
  }
}

function requireInsertedId(rows: Array<{ id: string }>): string {
  const id = rows[0]?.id;

  if (!id) {
    throw new Error('INSERT ... RETURNING produced no row');
  }

  return id;
}

/**
 * One of the demo users the seed migration ships — a row no prefix filter can
 * reach, so a task hung off it survives the sweep and only the ledger can undo
 * it. Read by query rather than by hard-coded UUID, so this suite stays
 * independent of which demo users the seed carries.
 */
async function readSeededUserId(dataSource: DataSource): Promise<string> {
  const rows = await dataSource.query<Array<{ id: string }>>(
    `SELECT id FROM users WHERE email NOT LIKE $1 ORDER BY id LIMIT 1`,
    [TEST_RECORD_LIKE_PATTERN],
  );
  const id = rows[0]?.id;

  if (!id) {
    throw new Error('The seed migration produced no demo users for this suite to work against');
  }

  return id;
}

/** The addresses that still have a row behind them; empty is what "the test's inserts left no trace" looks like. */
async function findSurvivingRows(
  dataSource: DataSource,
  rows: readonly RowAddress[],
): Promise<RowAddress[]> {
  const surviving: RowAddress[] = [];

  for (const row of rows) {
    if ((await readRowImage(dataSource, row)) !== undefined) {
      surviving.push(row);
    }
  }

  return surviving;
}

async function readRowImage(dataSource: DataSource, row: RowAddress): Promise<string | undefined> {
  const rows = await dataSource.query<Array<{ image: string }>>(
    `SELECT row_to_json(target)::text AS image FROM ${row.table} AS target WHERE target.id = $1`,
    [row.id],
  );

  return rows[0]?.image;
}

/** One column's current value, for comparing against the value the test replaced. Callers pass a column literal. */
async function readColumnAt(
  dataSource: DataSource,
  row: RowAddress,
  column: string,
): Promise<unknown> {
  const rows = await dataSource.query<Array<{ value: unknown }>>(
    `SELECT ${column} AS value FROM ${row.table} WHERE id = $1`,
    [row.id],
  );

  return rows[0]?.value;
}

/** Noon on the first of a month the migration provisioned, counted from this one. */
function withinProvisionedPartition(monthsAhead: number): Date {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(12, 0, 0, 0);
  startOfMonth.setUTCMonth(startOfMonth.getUTCMonth() + monthsAhead);

  return startOfMonth;
}

describeAgainstRealDatabase(
  'Integration test database helper, Given:a reachable Postgres instance',
  () => {
    const testDatabase = useTestDatabase();

    let seededUserId: string;

    /**
     * A task and its history entry belonging to nobody's test, standing in for
     * the work a developer has in their own database while the suite runs.
     * Nothing here is entitled to touch them, and the last test in the file
     * checks that nothing did — a fixture teardown reaching for an unqualified
     * `DELETE` fails loudly here instead of quietly emptying the table.
     */
    let bystanderSession: ForeignSession;
    let bystanderTask: RowAddress;
    let bystanderHistory: RowAddress;
    let bystanderTaskImage: string | undefined;
    let bystanderHistoryImage: string | undefined;

    beforeAll(async () => {
      seededUserId = await readSeededUserId(testDatabase.dataSource);
      bystanderSession = await ForeignSession.open();

      const bystanderWork = await bystanderSession.createTask(seededUserId);

      bystanderTask = { table: 'tasks', id: bystanderWork.taskId };
      bystanderHistory = { table: 'task_status_history', id: bystanderWork.historyId };
      bystanderTaskImage = await readRowImage(testDatabase.dataSource, bystanderTask);
      bystanderHistoryImage = await readRowImage(testDatabase.dataSource, bystanderHistory);
    });

    afterAll(async () => {
      await bystanderSession.close();
    });

    describe('When:the helper connects and replays the migrations', () => {
      it('should materialize every table the app migrations ship', async () => {
        const tables = await testDatabase.dataSource.query<Array<{ table_name: string }>>(`
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
    });

    describe('Given:a row without the reserved prefix, When:the backstop sweep runs on its own', () => {
      it('should leave it untouched, since the prefix is what bounds the sweep', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const unrelatedUser = await userRepository.save(
          buildTestUser({ name: 'Non-Test Bystander', email: 'bystander@example.com' }),
        );

        await cleanupTestDatabase(testDatabase.dataSource);

        // Removed by the ledger in the registered `afterEach` — which is exactly
        // why the sweep is only ever the backstop behind it.
        await expect(userRepository.exists({ where: { id: unrelatedUser.id } })).resolves.toBe(
          true,
        );
      });
    });

    describe('Given:a test that created tasks of its own and advanced one that was already there, When:cleanup runs', () => {
      it('should leave none of its own rows behind and put the advanced task back as it found it', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const foreignSession = await ForeignSession.open();

        try {
          const existingWork = await foreignSession.createTask(seededUserId);
          const existingTask: RowAddress = { table: 'tasks', id: existingWork.taskId };
          const statusBefore = await readColumnAt(testDatabase.dataSource, existingTask, 'status');

          // Seed-shaped: a user row written the way the seed migration writes
          // one, purely so the tasks below have somebody to be assigned to.
          const assignee = await userRepository.save(buildTestUser());
          const ownWork = await createTask(testDatabase.dataSource, assignee.id);
          // The history row also proves the trigger reaches a partitioned write:
          // it is declared on the parent and has to fire from whichever monthly
          // partition the row actually routes into.
          const ownAdvanceId = await advanceTask(testDatabase.dataSource, ownWork.taskId, {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: assignee.id,
            customFields: { quote1: '100 USD' },
          });
          const advanceOfExistingId = await advanceTask(
            testDatabase.dataSource,
            existingWork.taskId,
            {
              fromStatus: 1,
              toStatus: 2,
              assignedUserId: seededUserId,
              customFields: { quote1: '250 USD' },
            },
          );

          await testDatabase.cleanup();

          await expect(
            findSurvivingRows(testDatabase.dataSource, [
              { table: 'users', id: assignee.id },
              { table: 'tasks', id: ownWork.taskId },
              { table: 'task_status_history', id: ownWork.historyId },
              { table: 'task_status_history', id: ownAdvanceId },
              { table: 'task_status_history', id: advanceOfExistingId },
            ]),
          ).resolves.toEqual([]);
          await expect(
            readColumnAt(testDatabase.dataSource, existingTask, 'status'),
          ).resolves.toEqual(statusBefore);
          await expect(
            readColumnAt(testDatabase.dataSource, existingTask, 'custom_fields'),
          ).resolves.toEqual({});
        } finally {
          await foreignSession.close();
        }
      });
    });

    describe('Given:a test that removed a row it did not create, When:cleanup runs', () => {
      it('should put the row and the children that went with it back exactly as they were', async () => {
        const foreignSession = await ForeignSession.open();

        try {
          // Nothing in this product deletes a row. The ledger's guarantee is not
          // allowed to depend on that staying true, so the path is covered here
          // with a statement the app never issues — against a row this test owns
          // the lifetime of, which is what keeps the assertion deterministic.
          const existingWork = await foreignSession.createTask(seededUserId);
          const taskImage = await readRowImage(testDatabase.dataSource, {
            table: 'tasks',
            id: existingWork.taskId,
          });
          const historyImage = await readRowImage(testDatabase.dataSource, {
            table: 'task_status_history',
            id: existingWork.historyId,
          });

          // The history row goes with it, by the cascade the schema declares.
          await testDatabase.dataSource.query(`DELETE FROM tasks WHERE id = $1`, [
            existingWork.taskId,
          ]);
          await testDatabase.cleanup();

          await expect(
            readRowImage(testDatabase.dataSource, { table: 'tasks', id: existingWork.taskId }),
          ).resolves.toBe(taskImage);
          await expect(
            readRowImage(testDatabase.dataSource, {
              table: 'task_status_history',
              id: existingWork.historyId,
            }),
          ).resolves.toBe(historyImage);
        } finally {
          await foreignSession.close();
        }
      });
    });

    describe('Given:a test that moved an existing history row into another month’s partition, When:cleanup runs', () => {
      it('should put it back in the partition it came from rather than leaving both', async () => {
        const foreignSession = await ForeignSession.open();

        try {
          // Another statement the app never issues, covered for the same reason:
          // Postgres splits a partition-key update into a delete and an insert,
          // and the trail has to fold the two halves back into one row.
          const existingWork = await foreignSession.createTask(seededUserId);
          const movedEntry: RowAddress = {
            table: 'task_status_history',
            id: existingWork.historyId,
          };
          const createdAtBefore = await readColumnAt(
            testDatabase.dataSource,
            movedEntry,
            'created_at',
          );

          await testDatabase.dataSource.query(
            `UPDATE task_status_history SET created_at = $1 WHERE id = $2`,
            [withinProvisionedPartition(1), existingWork.historyId],
          );
          await testDatabase.cleanup();

          await expect(
            readColumnAt(testDatabase.dataSource, movedEntry, 'created_at'),
          ).resolves.toEqual(createdAtBefore);
          await expect(
            countHistoryEntriesWithId(testDatabase.dataSource, existingWork.historyId),
          ).resolves.toBe(1);
        } finally {
          await foreignSession.close();
        }
      });
    });

    describe('Given:a test whose act phase threw partway through its writes, When:cleanup runs', () => {
      it('should still undo everything it had written before the throw', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const rowsWritten: RowAddress[] = [];

        const failingWrite = async (): Promise<never> => {
          const assignee = await userRepository.save(buildTestUser());
          rowsWritten.push({ table: 'users', id: assignee.id });
          const work = await createTask(testDatabase.dataSource, assignee.id);
          rowsWritten.push({ table: 'tasks', id: work.taskId });
          rowsWritten.push({ table: 'task_status_history', id: work.historyId });

          throw new Error('the act phase gave up here');
        };

        await expect(failingWrite()).rejects.toThrow('the act phase gave up here');
        await testDatabase.cleanup();

        expect(rowsWritten).toHaveLength(3);
        await expect(findSurvivingRows(testDatabase.dataSource, rowsWritten)).resolves.toEqual([]);
      });
    });

    describe('Given:a developer creating and advancing tasks while a ledgered test does the same, When:cleanup runs', () => {
      it('should undo only the test’s own work and leave the developer’s standing', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const foreignSession = await ForeignSession.open();

        try {
          const assignee = await userRepository.save(buildTestUser());
          const ownWork = await createTask(testDatabase.dataSource, assignee.id);
          const developerWork = await foreignSession.createTask(seededUserId);
          await foreignSession.advanceTask(developerWork.taskId, {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: seededUserId,
            customFields: { quote1: 'entered by hand' },
          });

          await testDatabase.cleanup();

          await expect(
            findSurvivingRows(testDatabase.dataSource, [
              { table: 'tasks', id: ownWork.taskId },
              { table: 'task_status_history', id: ownWork.historyId },
            ]),
          ).resolves.toEqual([]);
          await expect(foreignSession.readTaskColumn(developerWork.taskId, 'status')).resolves.toBe(
            2,
          );
          await expect(foreignSession.countHistoryOfTask(developerWork.taskId)).resolves.toBe(2);
        } finally {
          await foreignSession.close();
        }
      });
    });

    describe('Given:a test advanced a task while a developer closed that same task, When:cleanup runs', () => {
      it('should revert the columns only the test wrote, keep the developer’s, and refuse to overwrite the one both wrote', async () => {
        const foreignSession = await ForeignSession.open();

        try {
          const sharedWork = await foreignSession.createTask(seededUserId);
          const sharedTask: RowAddress = { table: 'tasks', id: sharedWork.taskId };
          const statusBefore = await readColumnAt(testDatabase.dataSource, sharedTask, 'status');

          await advanceTask(testDatabase.dataSource, sharedWork.taskId, {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: seededUserId,
            customFields: { quote1: '100 USD' },
          });
          await foreignSession.closeTask(sharedWork.taskId, {
            fromStatus: 2,
            assignedUserId: seededUserId,
          });

          // Both writes touch `updated_at`, exactly as the service's own do —
          // so that column has moved on since the test wrote it and is the one
          // the ledger must report rather than overwrite.
          await expect(testDatabase.cleanup()).rejects.toThrow(/updated_at/);

          await expect(
            readColumnAt(testDatabase.dataSource, sharedTask, 'status'),
          ).resolves.toEqual(statusBefore);
          await expect(
            readColumnAt(testDatabase.dataSource, sharedTask, 'custom_fields'),
          ).resolves.toEqual({});
          await expect(
            readColumnAt(testDatabase.dataSource, sharedTask, 'is_closed'),
          ).resolves.toBe(true);
        } finally {
          await foreignSession.close();
          await testDatabase.openLedger();
        }
      });
    });

    describe('Given:a test pointed an existing row at one it had just inserted, When:cleanup runs', () => {
      it('should unpick the reference before deleting what it pointed at, rather than deadlocking on the foreign key', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const foreignSession = await ForeignSession.open();

        try {
          const existingWork = await foreignSession.createTask(seededUserId);
          const newAssignee = await userRepository.save(buildTestUser());

          await advanceTask(testDatabase.dataSource, existingWork.taskId, {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: newAssignee.id,
            customFields: {},
          });
          await testDatabase.cleanup();

          await expect(
            foreignSession.readTaskColumn(existingWork.taskId, 'assigned_user_id'),
          ).resolves.toBe(seededUserId);
          await expect(userRepository.exists({ where: { id: newAssignee.id } })).resolves.toBe(
            false,
          );
        } finally {
          await foreignSession.close();
        }
      });
    });

    describe('Given:a developer advanced a task the test had just created, When:cleanup runs', () => {
      it('should refuse to delete the task, undo everything else, and report what it left behind', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const assignee = await userRepository.save(buildTestUser());
        const ownWork = await createTask(testDatabase.dataSource, assignee.id);
        const unrelatedAssignee = await userRepository.save(buildTestUser());
        const foreignSession = await ForeignSession.open();

        try {
          await foreignSession.advanceTask(ownWork.taskId, {
            fromStatus: 1,
            toStatus: 2,
            assignedUserId: seededUserId,
            customFields: {},
          });

          await expect(testDatabase.cleanup()).rejects.toThrow(/task_status_history/);
          // One row it could not undo does not cost the rest their undo.
          await expect(
            userRepository.exists({ where: { id: unrelatedAssignee.id } }),
          ).resolves.toBe(false);
          // The developer's entry is still there — the cascade never ran.
          await expect(foreignSession.countHistoryOfTask(ownWork.taskId)).resolves.toBe(1);
        } finally {
          await foreignSession.close();
          // Removed before the ledger is re-opened, not after: a delete made
          // against a fresh ledger reads as "the test removed a row that was
          // already there", and the next restore would put it straight back.
          await testDatabase.dataSource.query(`DELETE FROM task_status_history WHERE id = $1`, [
            ownWork.historyId,
          ]);
          await testDatabase.dataSource.query(`DELETE FROM tasks WHERE id = $1`, [ownWork.taskId]);
          await testDatabase.dataSource.query(`DELETE FROM users WHERE id = $1`, [assignee.id]);
          await testDatabase.openLedger();
        }
      });
    });

    describe('Given:the audit trail went away while a test was writing, When:cleanup runs', () => {
      it('should refuse to report a clean restore it cannot actually perform', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const assignee = await userRepository.save(buildTestUser());

        // Exactly what a second handle's teardown does to the trail this suite
        // is still using — the shared objects are schema, not per-handle state.
        const scopedDatabase = await setupTestDatabase();
        await scopedDatabase.teardown();

        await expect(testDatabase.cleanup()).rejects.toThrow(/no open ledger/i);

        // Removed while there is still no trail to record it, so the ledger
        // re-opened below has nothing to put back.
        await testDatabase.dataSource.query(`DELETE FROM users WHERE id = $1`, [assignee.id]);
        await testDatabase.openLedger();
      });
    });

    describe('Given:an initialized connection, When:teardown runs', () => {
      it('should take the audit trail and its triggers back out and close the DataSource', async () => {
        const scopedDatabase = await setupTestDatabase();

        await scopedDatabase.teardown();

        expect(scopedDatabase.dataSource.isInitialized).toBe(false);
        await expect(isLedgerAuditInstalled(testDatabase.dataSource)).resolves.toBe(false);

        // Re-armed by hand: the teardown above took the shared trail with it,
        // and the registered `afterEach` is about to need one.
        await testDatabase.openLedger();
      });
    });

    describe('Given:rows belonging to no test at all, When:every test above has run', () => {
      it('should have left them byte-identical, fixture teardowns included', async () => {
        await expect(readRowImage(testDatabase.dataSource, bystanderTask)).resolves.toBe(
          bystanderTaskImage,
        );
        await expect(readRowImage(testDatabase.dataSource, bystanderHistory)).resolves.toBe(
          bystanderHistoryImage,
        );
      });
    });
  },
);

async function countHistoryEntriesWithId(
  dataSource: DataSource,
  historyId: string,
): Promise<number> {
  const rows = await dataSource.query<Array<{ entries: number }>>(
    `SELECT count(*)::int AS entries FROM task_status_history WHERE id = $1`,
    [historyId],
  );

  return rows[0]?.entries ?? 0;
}
