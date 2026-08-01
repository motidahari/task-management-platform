import { DataSource } from 'typeorm';

import {
  PARTITION_MAINTENANCE_LOCK_KEY,
  PartitionMaintenanceService,
} from '../../../../../src/infrastructure/database/partitioning/partition-maintenance.service';

const DATABASE_URL = process.env.DB_URL;
const HISTORY_TABLE_NAME = 'task_status_history';

/**
 * A schema of its own, never `public` — this spec's `DROP`/`CREATE` of a
 * bare `task_status_history` must never collide with the real migrated
 * `public.task_status_history` every other integration/API spec in the same
 * run depends on. `search_path` (below) is what makes the service's
 * unqualified table name resolve here instead of into `public`.
 */
const TEST_SCHEMA_NAME = 'partition_maint_test';

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

/**
 * Scoped to {@link TEST_SCHEMA_NAME} — `public` already carries the real,
 * migrated `task_status_history_*` partitions, so an unscoped
 * `information_schema.tables` lookup would double-count this spec's own
 * partitions with those.
 */
async function historyPartitionNames(dataSource: DataSource): Promise<string[]> {
  const rows: Array<{ table_name: string }> = await dataSource.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE $2`,
    [TEST_SCHEMA_NAME, `${HISTORY_TABLE_NAME}\\_%`],
  );

  return rows.map((row) => row.table_name);
}

describeAgainstRealDatabase(
  'PartitionMaintenanceService lock exclusion, Given:a real Postgres instance',
  () => {
    let dataSource: DataSource;
    let databaseReachable = true;

    beforeAll(async () => {
      dataSource = new DataSource({
        type: 'postgres',
        url: DATABASE_URL,
        entities: [],
        // TypeORM's own `schema` option only qualifies names it generates
        // itself (entity/schema-builder SQL) — it never issues a `SET
        // search_path`, so it would not affect the raw, unqualified queries
        // this spec and `PartitionMaintenanceService` both run. `options` is
        // a real `pg`/libpq connection parameter: Postgres parses it as
        // command-line-style flags at session start, so every physical
        // connection this pool ever opens — including the ones the service
        // pulls via its own `dataSource.createQueryRunner()` — resolves
        // `task_status_history` into `TEST_SCHEMA_NAME`, never `public`.
        extra: { options: `-c search_path=${TEST_SCHEMA_NAME}` },
      });

      try {
        await dataSource.initialize();
      } catch {
        // DB_URL was set but nothing is actually listening (e.g. compose not
        // up) — every test below backs off cleanly instead of failing.
        databaseReachable = false;
      }

      if (databaseReachable) {
        // Deliberately outside the connectivity catch above: a genuine setup
        // failure here (a typo, a bad search_path, a permissions problem)
        // must fail the suite loudly, not get misreported as "database
        // unreachable" and silently pass every test via the early return.
        //
        // Schema-qualified, so it succeeds regardless of the current
        // `search_path` — unlike the unqualified statements below, which
        // depend on this having already run.
        await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA_NAME}`);
        await recreateBareHistoryParent(dataSource);
      }
    });

    afterAll(async () => {
      if (databaseReachable) {
        // Cascades onto the parent and every partition created under it in
        // one statement — `public.task_status_history` is never touched.
        await dataSource.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA_NAME} CASCADE`);
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
