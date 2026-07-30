import { MigrationInterface, QueryRunner } from 'typeorm';

import { buildMonthlyPartitionPlan } from './support/monthly-partition-plan';

const HISTORY_TABLE = 'task_status_history';

/**
 * How far ahead of the current month the initial migration provisions
 * partitions. A daily scheduled job (outside this migration's scope) tops
 * this horizon back up over time; this constant only sizes the one-time
 * initial buffer.
 */
const FUTURE_MONTHS_AHEAD = 3;

/**
 * Creates the full schema: `users`, `tasks`, and the append-only,
 * range-partitioned `task_status_history` audit trail, plus every FK, CHECK
 * and index the read paths depend on. Raw SQL rather than the query
 * builder: `PARTITION BY RANGE`, partition attachment, and partial indexes
 * are DDL shapes the builder does not express.
 */
export class InitSchema1700000000001 implements MigrationInterface {
  name = 'InitSchema1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createUsersTable(queryRunner);
    await this.createTasksTable(queryRunner);
    await this.createTaskStatusHistoryTable(queryRunner);
    await this.createInitialHistoryPartitions(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping a partitioned parent table drops all of its partitions with
    // it, so the per-partition tables never need to be named here.
    await queryRunner.query(`DROP TABLE IF EXISTS ${HISTORY_TABLE}`);
    await queryRunner.query('DROP TABLE IF EXISTS tasks');
    await queryRunner.query('DROP TABLE IF EXISTS users');
  }

  private async createUsersTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        email varchar(255) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  private async createTasksTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type varchar(50) NOT NULL,
        status int NOT NULL DEFAULT 1 CONSTRAINT ck_tasks_status_positive CHECK (status >= 1),
        is_closed boolean NOT NULL DEFAULT false,
        assigned_user_id uuid NOT NULL REFERENCES users (id),
        custom_fields jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // All three keyset columns DESC: ORDER BY created_at DESC, id DESC and
    // the "< (cursor_created_at, cursor_id)" row-comparison predicate then
    // match the index direction exactly, so every page is a single index
    // range scan instead of a filter or a per-page sort.
    await queryRunner.query(`
      CREATE INDEX idx_tasks_assignee_page
        ON tasks (assigned_user_id, created_at DESC, id DESC)
    `);

    // Partial on the hottest variant: "my open tasks" is the default view,
    // closed tasks accumulate without bound, so this index stays
    // proportional to the small, cache-hot open working set instead of
    // growing forever alongside the full table.
    await queryRunner.query(`
      CREATE INDEX idx_tasks_assignee_open
        ON tasks (assigned_user_id, created_at DESC, id DESC)
        WHERE is_closed = false
    `);

    await queryRunner.query('CREATE INDEX idx_tasks_type ON tasks (type)');
  }

  private async createTaskStatusHistoryTable(queryRunner: QueryRunner): Promise<void> {
    // Composite PK (id, created_at): Postgres requires the partition key
    // inside the primary key, even though id alone is already globally
    // unique.
    await queryRunner.query(`
      CREATE TABLE ${HISTORY_TABLE} (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        from_status int,
        to_status int,
        assigned_user_id uuid NOT NULL REFERENCES users (id),
        fields_snapshot jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_task_status_history_from_or_to_present
          CHECK (NOT (from_status IS NULL AND to_status IS NULL)),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);

    // id is part of the index, not just created_at: the timeline is
    // keyset-paginated oldest-first on (created_at, id), and a create plus
    // its immediate first transition can land in the same millisecond —
    // without id as a tiebreaker those rows sit in arbitrary order, forcing
    // a per-page sort and risking skipped or duplicated rows across pages.
    // Declared on the partitioned parent before any partition exists, so
    // every partition attached afterwards inherits it automatically.
    await queryRunner.query(`
      CREATE INDEX idx_history_task
        ON ${HISTORY_TABLE} (task_id, created_at, id)
    `);
  }

  /**
   * Provisions the current month plus a fixed horizon of future months,
   * computed from the migration's own run time rather than a literal date
   * — deploying this migration on any day provisions the correct window.
   * Deliberately no DEFAULT partition: an insert that lands outside every
   * created range must fail loudly at write time instead of being silently
   * absorbed into a catch-all that later blocks provisioning the very range
   * it should have gone to.
   */
  private async createInitialHistoryPartitions(queryRunner: QueryRunner): Promise<void> {
    const partitionPlan = buildMonthlyPartitionPlan(HISTORY_TABLE, new Date(), FUTURE_MONTHS_AHEAD);

    for (const range of partitionPlan) {
      await queryRunner.query(`
        CREATE TABLE ${range.partitionName} PARTITION OF ${HISTORY_TABLE}
          FOR VALUES FROM ('${range.rangeStartInclusive}') TO ('${range.rangeEndExclusive}')
      `);
    }
  }
}
