import path from 'node:path';

import { DataSource } from 'typeorm';

import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';

/**
 * Same env var the running app reads (`DB_URL`) — one database URL, one
 * source of truth for every environment this suite might run in: a
 * developer's local Postgres or CI's ephemeral service container.
 */
const DATABASE_URL = process.env.DB_URL;

/**
 * Every row an integration suite creates through this helper must carry
 * this prefix in a human-identifying column (`users.name` / `users.email`)
 * — {@link cleanupTestDatabase} deletes exactly what carries it, so pointing
 * `DB_URL` at a database another suite or a developer still has data in
 * never loses anything unrelated.
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
   * Deletes every row this helper's builders could have produced, in
   * FK-safe (children-before-parents) order, filtered to
   * {@link TEST_RECORD_PREFIX}. Safe to call between tests in the same
   * suite — leaves any pre-existing, non-prefixed data untouched.
   */
  cleanup(): Promise<void>;
  /** Closes the connection. Call once, after every test in the suite has finished. */
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
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  return {
    dataSource,
    cleanup: () => cleanupTestDatabase(dataSource),
    teardown: () => dataSource.destroy(),
  };
}

/**
 * Deletes only rows {@link TEST_RECORD_PREFIX} could have produced, in one
 * transaction, children before parents so no foreign key ever blocks a
 * delete: history rows reference tasks and (independently, per transition)
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
