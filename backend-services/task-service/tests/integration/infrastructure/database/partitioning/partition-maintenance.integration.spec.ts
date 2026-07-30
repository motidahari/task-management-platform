import { DataSource } from 'typeorm';

import {
  PARTITION_MAINTENANCE_LOCK_KEY,
  PartitionMaintenanceService,
} from '../../../../../src/infrastructure/database/partitioning/partition-maintenance.service';

const DATABASE_URL = process.env.DB_URL;
const HISTORY_TABLE_NAME = 'task_status_history';

/**
 * Runs only against a real Postgres instance reachable at the same `DB_URL`
 * the app itself reads — skipped entirely, rather than failed, when no
 * database is configured for the local run (e.g. outside `docker compose up`).
 */
const describeAgainstRealDatabase = DATABASE_URL ? describe : describe.skip;

/**
 * A parent bare enough to accept `PARTITION OF` attachments without pulling
 * in the rest of the schema (`users`, `tasks`, their FKs) that this test has
 * no need for — only the partitioned-parent shape matters here.
 */
async function recreateBareHistoryParent(dataSource: DataSource): Promise<void> {
  await dataSource.query(`DROP TABLE IF EXISTS ${HISTORY_TABLE_NAME}`);
  await dataSource.query(`
    CREATE TABLE ${HISTORY_TABLE_NAME} (
      id uuid NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at)
  `);
}

async function historyPartitionNames(dataSource: DataSource): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await dataSource.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name LIKE '${HISTORY_TABLE_NAME}\\_%'`,
  );

  return rows.map((row) => row.table_name);
}

describeAgainstRealDatabase(
  'PartitionMaintenanceService lock exclusion, Given:a real Postgres instance',
  () => {
    let dataSource: DataSource;
    let databaseReachable = true;

    beforeAll(async () => {
      dataSource = new DataSource({ type: 'postgres', url: DATABASE_URL, entities: [] });

      try {
        await dataSource.initialize();
        await recreateBareHistoryParent(dataSource);
      } catch {
        // DB_URL was set but nothing is actually listening (e.g. compose not
        // up) — every test below backs off cleanly instead of failing.
        databaseReachable = false;
      }
    });

    afterAll(async () => {
      if (databaseReachable) {
        await dataSource.query(`DROP TABLE IF EXISTS ${HISTORY_TABLE_NAME}`);
      }

      if (dataSource?.isInitialized) {
        await dataSource.destroy();
      }
    });

    describe('When:another session already holds the maintenance lock', () => {
      it('should back off without creating any partition or throwing', async () => {
        if (!databaseReachable) {
          return;
        }

        // A dedicated `QueryRunner` holds its own connection for its entire
        // lifetime — kept open here (never released mid-test) so it is a
        // genuinely separate session from whichever pooled connection the
        // service's own `provisionPartitions()` call obtains below.
        const lockHolder = dataSource.createQueryRunner();
        await lockHolder.connect();

        try {
          await lockHolder.query('SELECT pg_advisory_lock($1)', [PARTITION_MAINTENANCE_LOCK_KEY]);

          const service = new PartitionMaintenanceService(dataSource);

          await expect(service.provisionPartitions()).resolves.toBeUndefined();
          expect(await historyPartitionNames(dataSource)).toHaveLength(0);
        } finally {
          await lockHolder.query('SELECT pg_advisory_unlock($1)', [PARTITION_MAINTENANCE_LOCK_KEY]);
          await lockHolder.release();
        }
      });
    });

    describe('When:two replicas run provisionPartitions concurrently against an unheld lock', () => {
      it('should let exactly one perform the DDL, with both resolving and no duplicate-partition failure', async () => {
        if (!databaseReachable) {
          return;
        }

        await recreateBareHistoryParent(dataSource);

        const service = new PartitionMaintenanceService(dataSource);

        await expect(
          Promise.all([service.provisionPartitions(), service.provisionPartitions()]),
        ).resolves.toEqual([undefined, undefined]);

        expect(await historyPartitionNames(dataSource)).toHaveLength(4);
      });
    });
  },
);
