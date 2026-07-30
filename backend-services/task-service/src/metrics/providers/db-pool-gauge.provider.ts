import type { Provider } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import type { DataSource } from 'typeorm';

import { READ_CONNECTION } from '../../infrastructure/database/database.module';
import { DB_POOL_CONNECTIONS_GAUGE_NAME } from '../metrics.constants';

const CONNECTION_NAME = {
  WRITE: 'write',
  READ: 'read',
} as const;

const POOL_STATE = {
  IN_USE: 'in_use',
  IDLE: 'idle',
  WAITING: 'waiting',
} as const;

/**
 * The subset of `pg.Pool` this gauge reads. The TypeORM postgres driver
 * types its underlying pool as `any` (`driver.master`), so this is narrowed
 * with a runtime check before anything trusts its shape — a DataSource whose
 * driver has not opened a real pool (as in a test double) is skipped instead
 * of throwing.
 */
interface PgPoolLike {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}

function isPgPoolLike(value: unknown): value is PgPoolLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PgPoolLike).totalCount === 'number' &&
    typeof (value as PgPoolLike).idleCount === 'number' &&
    typeof (value as PgPoolLike).waitingCount === 'number'
  );
}

function poolOf(dataSource: DataSource): PgPoolLike | undefined {
  const driver = dataSource.driver as { master?: unknown } | undefined;
  const pool = driver?.master;

  return isPgPoolLike(pool) ? pool : undefined;
}

function setPoolReadings(
  gauge: Gauge<string>,
  connection: string,
  pool: PgPoolLike | undefined,
): void {
  if (!pool) {
    return;
  }

  gauge.set({ connection, state: POOL_STATE.IN_USE }, pool.totalCount - pool.idleCount);
  gauge.set({ connection, state: POOL_STATE.IDLE }, pool.idleCount);
  gauge.set({ connection, state: POOL_STATE.WAITING }, pool.waitingCount);
}

/**
 * Exported on its own so the collection logic is unit-testable against a
 * fake gauge and fake DataSources, without going through Nest DI or a real
 * `pg.Pool`. Called by the gauge's `collect` below with the write and read
 * DataSources injected at scrape time — reading the live pool then, not a
 * cached snapshot.
 */
export function collectDbPoolGaugeReadings(
  gauge: Gauge<string>,
  writeDataSource: DataSource,
  readDataSource: DataSource,
): void {
  setPoolReadings(gauge, CONNECTION_NAME.WRITE, poolOf(writeDataSource));
  setPoolReadings(gauge, CONNECTION_NAME.READ, poolOf(readDataSource));
}

export const dbPoolConnectionsGaugeProvider: Provider = makeGaugeProvider({
  name: DB_POOL_CONNECTIONS_GAUGE_NAME,
  help: 'Postgres connection pool state (in_use/idle/waiting) per named DataSource.',
  labelNames: ['connection', 'state'],
  inject: [getDataSourceToken(), getDataSourceToken(READ_CONNECTION)],
  collect(writeDataSource: DataSource, readDataSource: DataSource): void {
    collectDbPoolGaugeReadings(this, writeDataSource, readDataSource);
  },
});
