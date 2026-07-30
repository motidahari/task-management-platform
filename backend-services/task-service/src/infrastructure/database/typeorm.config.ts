import type { DataSourceOptions } from 'typeorm';

import { TaskEntity } from '../../domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../domain/entities/task-status-history.entity';
import { UserEntity } from '../../domain/entities/user.entity';
import type { DatabaseConfig, MigrationDatabaseConfig } from '../config/app.config';

/**
 * Every DataSource this service builds is Postgres — narrowing the return
 * type (rather than the full `DataSourceOptions` union) keeps `url`,
 * `poolSize`, `extra` and `migrations` typed instead of "possibly undefined
 * on this member of the union".
 */
type PostgresDataSourceOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

const ENTITIES: PostgresDataSourceOptions['entities'] = [
  UserEntity,
  TaskEntity,
  TaskStatusHistoryEntity,
];

/** Where the compiled migration runner (the one that ships in the production image) looks for migration files. */
const COMPILED_MIGRATIONS_GLOB = 'dist/migrations/*.js';

/**
 * Any statement over this threshold is logged as a slow query — the signal
 * that turns "the DB feels slow" into "this exact statement, this long".
 * Left off the migration DataSource: migrations legitimately run for
 * minutes (see its `statement_timeout: 0`), so flagging them as slow would
 * just be noise on every deploy.
 */
const SLOW_QUERY_THRESHOLD_MS = 1000;

/**
 * All mutations and locking reads — the connection that must see committed
 * primary state.
 */
export function buildWriteDataSourceOptions(database: DatabaseConfig): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: database.writeUrl,
    poolSize: database.poolSize,
    extra: {
      statement_timeout: database.statementTimeoutMs,
      lock_timeout: database.lockTimeoutMs,
    },
    entities: ENTITIES,
    synchronize: false,
    migrationsRun: false,
    maxQueryExecutionTime: SLOW_QUERY_THRESHOLD_MS,
  };
}

/**
 * Lag-tolerant list/read queries. Resolves to the same URL as the write
 * DataSource by default; `database.readUrl` already carries the read-replica
 * fallback resolved once in `app.config.ts`, so routing to a replica later is
 * an env change, never a code change here.
 */
export function buildReadDataSourceOptions(database: DatabaseConfig): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: database.readUrl,
    poolSize: database.poolSize,
    extra: {
      statement_timeout: database.statementTimeoutMs,
      lock_timeout: database.lockTimeoutMs,
    },
    entities: ENTITIES,
    synchronize: false,
    migrationsRun: false,
    maxQueryExecutionTime: SLOW_QUERY_THRESHOLD_MS,
  };
}

/**
 * The one-shot migration job's connection — exempt from the runtime pool's
 * timeouts. `statement_timeout: 0` because an additive migration on a
 * populated table (e.g. building an index) can legitimately run for minutes;
 * killing it at the runtime default would abort a deploy mid-migration.
 * `lock_timeout` is left unset for the same reason: a migration may have to
 * wait behind another statement's lock and should not be pre-emptively cut
 * off.
 *
 * `migrationsGlob` defaults to the compiled output because that is what
 * actually ships and runs in the production image; a host-side development
 * entry point can pass the TypeScript source glob instead.
 *
 * Takes only {@link MigrationDatabaseConfig} (just `writeUrl`), not the full
 * {@link DatabaseConfig} — this function never reads the pool size or the
 * runtime timeouts, so its signature does not ask its one caller (the
 * migration entry point) for values it has no way to need.
 */
export function buildMigrationDataSourceOptions(
  database: MigrationDatabaseConfig,
  migrationsGlob: string = COMPILED_MIGRATIONS_GLOB,
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: database.writeUrl,
    extra: {
      statement_timeout: 0,
    },
    entities: ENTITIES,
    migrations: [migrationsGlob],
    synchronize: false,
    migrationsRun: false,
  };
}
