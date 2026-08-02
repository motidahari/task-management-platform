import { DataSource, Like } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { buildTestHistoryEntry, buildTestTask, buildTestUser } from './test-data-builders';
import {
  cleanupTestDatabase,
  isTestDatabaseConfigured,
  setupTestDatabase,
  TEST_RECORD_PREFIX,
  TestDatabase,
} from './test-database';
import { isLedgerAuditInstalled } from './test-database-ledger';

/**
 * Every other integration suite in this service trusts `setupTestDatabase`
 * / `cleanupTestDatabase` to materialize the schema, undo what the test wrote
 * and leave everything else — rows and schema objects alike — exactly as it
 * was. This suite is that contract's own coverage, independent of any one
 * consumer. Skipped, not failed, when no database is configured for the local
 * run — the same convention the partition-maintenance integration spec uses.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

/** Same escaping the helper's own sweep uses — `_` is a `LIKE` wildcard, and only the trailing `%` should act as one. */
const TEST_RECORD_LIKE_PATTERN = `${TEST_RECORD_PREFIX.replace(/[%_]/g, '\\$&')}%`;

const FOREIGN_USER_EMAIL = 'entered-by-hand@example.com';

/** Postgres returns `count(*)` as a `bigint`, which the driver hands back as a string. */
interface TableRowCounts {
  readonly users: string;
  readonly tasks: string;
  readonly history: string;
}

/**
 * What the database looked like at one instant, in the two terms a developer
 * would check by hand after a run: how many rows each table holds, and the
 * seeded users' own rows verbatim — the rows nothing in a test is entitled to
 * change and nothing keyed on {@link TEST_RECORD_PREFIX} could ever put back.
 */
interface DatabaseFingerprint {
  readonly rowCounts: TableRowCounts | undefined;
  readonly seededUserRows: readonly string[];
}

async function readDatabaseFingerprint(dataSource: DataSource): Promise<DatabaseFingerprint> {
  const [rowCounts]: TableRowCounts[] = await dataSource.query(`
    SELECT (SELECT count(*) FROM users) AS users,
           (SELECT count(*) FROM tasks) AS tasks,
           (SELECT count(*) FROM task_status_history) AS history
  `);

  const seededUsers: Array<{ image: string }> = await dataSource.query(
    `SELECT row_to_json(source)::text AS image FROM users AS source
     WHERE email NOT LIKE $1 ORDER BY id`,
    [TEST_RECORD_LIKE_PATTERN],
  );

  return { rowCounts, seededUserRows: seededUsers.map((row) => row.image) };
}

interface SeededUser {
  readonly id: string;
  readonly name: string;
}

/**
 * Two of the demo users the seed migration ships — rows no prefix filter can
 * reach, so anything a test hangs off one (or does to one) survives the sweep
 * and only the ledger can undo. Read by query rather than by hard-coded UUID,
 * so this suite stays independent of which demo users the seed carries, and
 * throws rather than skipping if it stops carrying two.
 */
async function readSeededUsers(dataSource: DataSource): Promise<[SeededUser, SeededUser]> {
  const rows: SeededUser[] = await dataSource.query(
    `SELECT id, name FROM users WHERE email NOT LIKE $1 ORDER BY id LIMIT 2`,
    [TEST_RECORD_LIKE_PATTERN],
  );
  const [first, second] = rows;

  if (!first || !second) {
    throw new Error('The seed migration produced fewer than the two demo users this suite needs');
  }

  return [first, second];
}

async function readUserName(dataSource: DataSource, userId: string): Promise<string | undefined> {
  const rows: Array<{ name: string }> = await dataSource.query(
    `SELECT name FROM users WHERE id = $1`,
    [userId],
  );

  return rows[0]?.name;
}

/**
 * A connection the ledger never marked, which is the shape of every session
 * that is not this suite: the running backend's own pool behind a developer's
 * browser, or a `psql` window. Writes made over it are the ones the restore
 * must never be able to name.
 */
async function connectForeignSession(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DB_URL,
    entities: [],
  });

  await dataSource.initialize();

  return dataSource;
}

describeAgainstRealDatabase(
  'Integration test database helper, Given:a reachable Postgres instance',
  () => {
    let testDatabase: TestDatabase;

    beforeAll(async () => {
      testDatabase = await setupTestDatabase();
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
    });

    describe('Given:a row without the reserved prefix, When:the backstop sweep runs on its own', () => {
      it('should leave it untouched, since the prefix is what bounds the sweep', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const unrelatedUser = await userRepository.save(
          buildTestUser({ name: 'Non-Test Bystander', email: 'bystander@example.com' }),
        );

        await cleanupTestDatabase(testDatabase.dataSource);

        // Removed by the ledger in this suite's `afterEach` — which is exactly
        // why the sweep is only ever the backstop behind it.
        await expect(userRepository.exists({ where: { id: unrelatedUser.id } })).resolves.toBe(
          true,
        );
      });
    });

    describe('Given:a test that wrote through the builders, through raw SQL and over an existing row, When:cleanup runs', () => {
      it('should leave every table exactly as the test found it, rows the prefix sweep cannot reach included', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const taskRepository = testDatabase.dataSource.getRepository(TaskEntity);
        const historyRepository = testDatabase.dataSource.getRepository(TaskStatusHistoryEntity);
        const [seededUser] = await readSeededUsers(testDatabase.dataSource);
        const fingerprintBefore = await readDatabaseFingerprint(testDatabase.dataSource);

        const builtUser = await userRepository.save(buildTestUser());
        const builtTask = await taskRepository.save(buildTestTask(builtUser.id));
        // A history row also proves the trigger reaches a partitioned write: it
        // is declared on the parent and has to fire from whichever monthly
        // partition the row actually routes into.
        await historyRepository.save(buildTestHistoryEntry(builtTask.id, builtUser.id));
        await testDatabase.dataSource.query(`UPDATE users SET name = $1 WHERE id = $2`, [
          `${TEST_RECORD_PREFIX}renamed`,
          seededUser.id,
        ]);
        // Assigned to the seeded user rather than to a built one, so neither
        // row carries the prefix through any foreign key the sweep follows.
        const rawTasks: Array<{ id: string }> = await testDatabase.dataSource.query(
          `INSERT INTO tasks (type, assigned_user_id) VALUES ($1, $2) RETURNING id`,
          ['procurement', seededUser.id],
        );
        await testDatabase.dataSource.query(
          `INSERT INTO task_status_history (task_id, from_status, to_status, assigned_user_id)
           VALUES ($1, NULL, 1, $2)`,
          [rawTasks[0]?.id, seededUser.id],
        );
        await testDatabase.cleanup();

        await expect(readDatabaseFingerprint(testDatabase.dataSource)).resolves.toEqual(
          fingerprintBefore,
        );
      });
    });

    describe('Given:another session writes to the same tables while a ledgered test runs, When:cleanup runs', () => {
      it('should undo only what the test itself wrote, leaving the other session’s insert and update standing', async () => {
        const userRepository = testDatabase.dataSource.getRepository(UserEntity);
        const [userTheTestEdits, userTheOtherSessionEdits] = await readSeededUsers(
          testDatabase.dataSource,
        );
        const foreignSession = await connectForeignSession();

        try {
          const ownUser = await userRepository.save(buildTestUser());
          await testDatabase.dataSource.query(`UPDATE users SET name = $1 WHERE id = $2`, [
            'Renamed by the test',
            userTheTestEdits.id,
          ]);
          const foreignUsers: Array<{ id: string }> = await foreignSession.query(
            `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id`,
            ['Entered by hand', FOREIGN_USER_EMAIL],
          );
          await foreignSession.query(`UPDATE users SET name = $1 WHERE id = $2`, [
            'Renamed by hand',
            userTheOtherSessionEdits.id,
          ]);

          await testDatabase.cleanup();

          await expect(userRepository.exists({ where: { id: ownUser.id } })).resolves.toBe(false);
          await expect(readUserName(testDatabase.dataSource, userTheTestEdits.id)).resolves.toBe(
            userTheTestEdits.name,
          );
          await expect(userRepository.exists({ where: { id: foreignUsers[0]?.id } })).resolves.toBe(
            true,
          );
          await expect(
            readUserName(testDatabase.dataSource, userTheOtherSessionEdits.id),
          ).resolves.toBe('Renamed by hand');
        } finally {
          // Reverted over the same unmarked session that made them: reverted
          // over the ledger's own connection they would be recorded as this
          // test's writes and undone a second time by the suite's `afterEach`.
          await foreignSession.query(`DELETE FROM users WHERE email = $1`, [FOREIGN_USER_EMAIL]);
          await foreignSession.query(`UPDATE users SET name = $1 WHERE id = $2`, [
            userTheOtherSessionEdits.name,
            userTheOtherSessionEdits.id,
          ]);
          await foreignSession.destroy();
        }
      });
    });

    describe('Given:an initialized connection, When:teardown runs', () => {
      it('should take the audit trail and its triggers back out and close the DataSource', async () => {
        const scopedDatabase = await setupTestDatabase();

        await scopedDatabase.teardown();

        expect(scopedDatabase.dataSource.isInitialized).toBe(false);
        await expect(isLedgerAuditInstalled(testDatabase.dataSource)).resolves.toBe(false);
      });
    });
  },
);
