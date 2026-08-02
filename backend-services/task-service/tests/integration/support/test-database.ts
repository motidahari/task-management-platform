import path from 'node:path';

import { DataSource } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import {
  clearRecordedWrites,
  enrolledRecordPrefixes,
  installLedgerAudit,
  LEDGER_CONNECTION_MARKER,
  openLedger,
  restoreLedger,
  TEST_RUN_ID,
  uninstallLedgerAudit,
} from './test-database-ledger';

/**
 * Same env var the running app reads (`DB_URL`) — one database URL, one
 * source of truth for every environment this suite might run in: a
 * developer's local Postgres or CI's ephemeral service container.
 */
const DATABASE_URL = process.env.DB_URL;

/**
 * Reserved by every run of this suite, in a human-identifying column
 * (`users.name` / `users.email`). It marks a row as a test record; it is not
 * how a test's writes are undone. The prefix can only ever reach rows shaped
 * like a builder's, so a task hung off a seeded user, a row written by raw SQL
 * and any row a test merely updated all sit outside it — those are the ledger's
 * job.
 */
export const TEST_RECORD_PREFIX = 'zztest_';

/**
 * What this run's own records carry. Two runs against one database — the normal
 * shape of parallel worktrees — would otherwise mint colliding emails against a
 * unique index, and each run's backstop sweep would carry off the other's rows
 * mid-test.
 */
export const TEST_RUN_RECORD_PREFIX = `${TEST_RECORD_PREFIX}${TEST_RUN_ID}_`;

/** Matches `%`/`_` themselves literally in a `LIKE` pattern — only the trailing `%` is a wildcard. */
export const TEST_RECORD_LIKE_PATTERN = toLikePrefixPattern(TEST_RECORD_PREFIX);

function toLikePrefixPattern(prefix: string): string {
  return `${prefix.replace(/[%_]/g, '\\$&')}%`;
}

/** The migration source this service ships, resolved from this file's own location so it works regardless of the process's working directory. */
const SOURCE_MIGRATIONS_GLOB = path.join(__dirname, '..', '..', '..', 'src', 'migrations', '*.ts');

const ENTITIES = [UserEntity, TaskEntity, TaskStatusHistoryEntity];

/**
 * True only when the environment supplies a database to run integration
 * suites against. Suites gate their whole `describe` block on this — see
 * the partition-maintenance integration spec — so a run with no database
 * configured skips cleanly instead of failing.
 */
export function isTestDatabaseConfigured(): boolean {
  return Boolean(DATABASE_URL);
}

export interface TestDatabase {
  readonly dataSource: DataSource;
  /**
   * Opens this test's ledger: the trail starts holding nothing of this run's,
   * so what it holds when the test ends is that test's writes and nothing else.
   * The builders, raw SQL and the running app all travel over this helper's own
   * pool, so all three are recorded without having to declare themselves.
   */
  openLedger(): Promise<void>;
  /**
   * Undoes exactly the writes the ledger recorded — rows that were already
   * there put back column by column, parents before children; rows the test
   * added deleted after, children before parents — and only then sweeps this
   * run's own records as a backstop. A write from any other connection,
   * including a developer's from the UI while the suite runs, is in neither set
   * and is never touched.
   *
   * Runs whether the test passed, failed or threw: the first red test must not
   * poison the database for the rest of the run. Idempotent — it drops the
   * writes it undid on its way out, so a second call finds nothing left to do.
   */
  cleanup(): Promise<void>;
  /**
   * Withdraws this run from the shared trail, taking the trail's own objects
   * with it once no other run is still using them, and closes the connection —
   * a developer's database is left with the schema it had before the run, not
   * just the rows.
   */
  teardown(): Promise<void>;
}

/**
 * What a suite gets from {@link useTestDatabase}: the connection, plus the two
 * lifecycle steps the helper's own coverage has to drive by hand to assert on
 * their effect. Teardown is deliberately absent — nothing but the registered
 * `afterAll` is entitled to close the connection out from under the suite.
 */
export interface TestDatabaseHandle {
  readonly dataSource: DataSource;
  openLedger(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Registers the whole per-suite database lifecycle in one call: the connection
 * opens before the suite, this test's ledger opens before each test, the
 * restore runs after each one, and the connection closes after the suite.
 *
 * The single registration point for a database-backed suite — a suite that
 * writes to the database and forgets to restore it is not expressible, because
 * there is no way to reach a connection without the hooks coming with it. Call
 * it once, at the top of the suite's `describe` body, so its `beforeAll` is
 * registered ahead of any the suite adds for itself.
 *
 * The returned handle reads the connection lazily: it only exists once the
 * registered `beforeAll` has run, so reach for it from a hook or a test, never
 * at describe scope.
 */
export function useTestDatabase(): TestDatabaseHandle {
  let testDatabase: TestDatabase | undefined;

  const requireConnected = (): TestDatabase => {
    if (!testDatabase) {
      throw new Error(
        'The test database is not connected yet — read the handle from inside a hook or a test, not at describe scope',
      );
    }

    return testDatabase;
  };

  beforeAll(async () => {
    testDatabase = await setupTestDatabase();
  });

  beforeEach(async () => {
    await requireConnected().openLedger();
  });

  afterEach(async () => {
    await requireConnected().cleanup();
  });

  afterAll(async () => {
    await testDatabase?.teardown();
  });

  return {
    get dataSource(): DataSource {
      return requireConnected().dataSource;
    },
    openLedger: () => requireConnected().openLedger(),
    cleanup: () => requireConnected().cleanup(),
  };
}

/**
 * Connects to `DB_URL` and replays every migration this service ships —
 * `runMigrations()` is idempotent, so a database already at the latest
 * migration is a no-op and a fresh one (a new CI service container, or a
 * disposable local database) is fully materialized before the first test
 * runs. Callers must check {@link isTestDatabaseConfigured} first; this
 * throws rather than silently skipping so a suite that forgets the guard
 * fails loudly instead of connecting to `undefined`.
 *
 * Prefer {@link useTestDatabase}, which calls this and registers the hooks that
 * go with it; reach for this directly only to assert on the lifecycle itself.
 */
export async function setupTestDatabase(): Promise<TestDatabase> {
  if (!DATABASE_URL) {
    throw new Error(
      'DB_URL is not set — guard the suite with isTestDatabaseConfigured() before calling setupTestDatabase()',
    );
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: DATABASE_URL,
    entities: ENTITIES,
    migrations: [SOURCE_MIGRATIONS_GLOB],
    synchronize: false,
    migrationsRun: false,
    // Every connection this pool opens announces itself under the one name the
    // audit trigger records this run's writes for. It is the whole basis of the
    // ledger's attribution, so it belongs to the pool, not to any single query.
    extra: { application_name: LEDGER_CONNECTION_MARKER },
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await installLedgerAudit(dataSource, TEST_RUN_RECORD_PREFIX);
  await sweepDepartedRunRecords(dataSource);

  return {
    dataSource,
    openLedger: async () => {
      // Reinstated here rather than in `cleanup`: another handle on the same
      // database may have taken the shared trail with it, and a ledger has to
      // exist before a test writes into it.
      await installLedgerAudit(dataSource, TEST_RUN_RECORD_PREFIX);
      await openLedger(dataSource);
    },
    cleanup: async () => {
      await restoreLedger(dataSource);
      await cleanupTestDatabase(dataSource);
      // The restore and the sweep are themselves writes over this pool, so the
      // trail now holds their undo — dropping those is what keeps a second
      // `cleanup` from undoing the first.
      await clearRecordedWrites(dataSource);
    },
    teardown: async () => {
      await uninstallLedgerAudit(dataSource);
      await dataSource.destroy();
    },
  };
}

/**
 * The backstop behind the ledger, never the mechanism a test relies on:
 * deletes only rows this run's own builders could have produced. Scoped to
 * {@link TEST_RUN_RECORD_PREFIX} rather than to the reserved prefix at large,
 * so a second run's records are as safe from it as a developer's are.
 */
export async function cleanupTestDatabase(dataSource: DataSource): Promise<void> {
  await deleteRecordsMatching(dataSource, 'email LIKE $1', [
    toLikePrefixPattern(TEST_RUN_RECORD_PREFIX),
  ]);
}

/**
 * The residue no ledger can account for: records left by a run that was killed
 * before it could undo them. Every run still enrolled is spared, so this can
 * never reach into a suite running out of another worktree at the same moment.
 */
async function sweepDepartedRunRecords(dataSource: DataSource): Promise<void> {
  const livePrefixes = await enrolledRecordPrefixes(dataSource);

  await deleteRecordsMatching(
    dataSource,
    `email LIKE $1 AND NOT EXISTS (
       SELECT 1 FROM unnest($2::text[]) AS live(prefix) WHERE users.email LIKE live.prefix || '%'
     )`,
    [TEST_RECORD_LIKE_PATTERN, livePrefixes],
  );
}

/**
 * Deletes the users `userPredicate` selects and everything hanging off them, in
 * one transaction, children before parents so no foreign key ever blocks a
 * delete — history rows reference tasks and (independently, per transition)
 * users; tasks reference users.
 */
async function deleteRecordsMatching(
  dataSource: DataSource,
  userPredicate: string,
  parameters: unknown[],
): Promise<void> {
  const matchingUsers = `SELECT id FROM users WHERE ${userPredicate}`;

  await dataSource.transaction(async (manager) => {
    await manager.query(
      `DELETE FROM task_status_history
       WHERE task_id IN (SELECT id FROM tasks WHERE assigned_user_id IN (${matchingUsers}))
          OR assigned_user_id IN (${matchingUsers})`,
      parameters,
    );

    await manager.query(
      `DELETE FROM tasks WHERE assigned_user_id IN (${matchingUsers})`,
      parameters,
    );

    await manager.query(`DELETE FROM users WHERE ${userPredicate}`, parameters);
  });
}
