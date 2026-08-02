import path from 'node:path';

import { DataSource } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import {
  clearLedgerAudit,
  ensureLedgerAuditInstalled,
  installLedgerAudit,
  LEDGER_CONNECTION_MARKER,
  restoreLedger,
  uninstallLedgerAudit,
} from './test-database-ledger';

/**
 * Same env var the running app reads (`DB_URL`) — one database URL, one
 * source of truth for every environment this suite might run in: a
 * developer's local Postgres or CI's ephemeral service container.
 */
const DATABASE_URL = process.env.DB_URL;

/**
 * Rows an integration suite creates through this helper's builders carry this
 * prefix in a human-identifying column (`users.name` / `users.email`). It is
 * the backstop {@link cleanupTestDatabase} sweeps, not how a test's writes are
 * undone: the prefix can only ever reach rows shaped like a builder's, so a
 * task hung off a seeded user, a row written by raw SQL and any row a test
 * merely updated all sit outside it. Those are the ledger's job — see
 * {@link TestDatabase.openLedger}.
 */
export const TEST_RECORD_PREFIX = 'zztest_';

/** Matches `%`/`_` themselves literally in a `LIKE` pattern — only `TEST_RECORD_PREFIX`'s trailing `%` is a wildcard. */
const TEST_RECORD_LIKE_PATTERN = `${TEST_RECORD_PREFIX.replace(/[%_]/g, '\\$&')}%`;

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
   * Opens this test's ledger: the audit trail starts empty, so what it holds
   * when the test ends is that test's writes and nothing else. Call from the
   * suite's `beforeEach`, ahead of anything the test writes — the builders, raw
   * SQL and the running app all travel over this helper's own pool, so all
   * three are recorded without having to declare themselves. A suite that skips
   * it fails loudly in {@link cleanup} rather than quietly leaving rows behind.
   */
  openLedger(): Promise<void>;
  /**
   * Undoes exactly the writes the ledger recorded — rows the test added deleted
   * children before parents, rows it changed or deleted put back as it found
   * them, parents before children — and only then sweeps
   * {@link TEST_RECORD_PREFIX} as a backstop. A row written over any other
   * connection, including one a developer creates from the UI while the suite
   * runs, is in neither of those two sets and is never touched.
   *
   * Call from the suite's `afterEach`, which the runner executes whether the
   * test passed, failed or threw: the first red test must not poison the
   * database for the rest of the run.
   *
   * Idempotent — it empties the trail on its way out, so a second call finds
   * nothing left to undo.
   */
  cleanup(): Promise<void>;
  /**
   * Removes the audit trail and its triggers, then closes the connection. Call
   * once, after every test in the suite has finished — a developer's database
   * must be left with the schema it had before the run, not just the rows.
   */
  teardown(): Promise<void>;
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
 * Suites sharing one database must run serialized: two suites writing over
 * this same pool at once are indistinguishable to the ledger, which attributes
 * writes by connection and not by suite.
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
    // audit trigger records writes for. It is the whole basis of the ledger's
    // attribution, so it belongs to the pool, not to any single query.
    extra: { application_name: LEDGER_CONNECTION_MARKER },
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await installLedgerAudit(dataSource);

  // A run that died before its teardown leaves prefixed rows behind, and the
  // ledger has no record of them to work from. This is the one place the
  // backstop is the primary mechanism.
  await cleanupTestDatabase(dataSource);

  let ledgerOpened = false;

  return {
    dataSource,
    openLedger: async () => {
      await ensureLedgerAuditInstalled(dataSource);
      await clearLedgerAudit(dataSource);
      ledgerOpened = true;
    },
    cleanup: async () => {
      if (!ledgerOpened) {
        throw new Error(
          'No ledger is open — call openLedger() from the suite’s beforeEach before cleanup()',
        );
      }

      await ensureLedgerAuditInstalled(dataSource);
      await restoreLedger(dataSource);
      await cleanupTestDatabase(dataSource);
      // The restore and the sweep are themselves writes over this pool, so the
      // trail now holds their undo — dropping it is what keeps a second
      // `cleanup` from undoing the first.
      await clearLedgerAudit(dataSource);
    },
    teardown: async () => {
      await uninstallLedgerAudit(dataSource);
      await dataSource.destroy();
    },
  };
}

/**
 * The backstop behind the ledger, never the mechanism a test relies on:
 * deletes only rows {@link TEST_RECORD_PREFIX} could have produced, in one
 * transaction, children before parents so no foreign key ever blocks a
 * delete — history rows reference tasks and (independently, per transition)
 * users; tasks reference users.
 */
export async function cleanupTestDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.query(
      `DELETE FROM task_status_history
       WHERE task_id IN (SELECT id FROM tasks WHERE assigned_user_id IN (SELECT id FROM users WHERE email LIKE $1))
          OR assigned_user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [TEST_RECORD_LIKE_PATTERN],
    );

    await manager.query(
      `DELETE FROM tasks WHERE assigned_user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
      [TEST_RECORD_LIKE_PATTERN],
    );

    await manager.query(`DELETE FROM users WHERE email LIKE $1`, [TEST_RECORD_LIKE_PATTERN]);
  });
}
