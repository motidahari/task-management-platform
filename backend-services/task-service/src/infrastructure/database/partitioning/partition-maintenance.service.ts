import { Logger } from '@core/shared';
import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, QueryRunner } from 'typeorm';

import { buildMonthlyPartitionPlan } from '../../../migrations/support/monthly-partition-plan';

const HISTORY_TABLE_NAME = 'task_status_history';

/**
 * Matches the one-time buffer the initial migration provisions, so the
 * horizon this job tops back up to never drifts from the buffer the schema
 * started with.
 */
const FUTURE_MONTHS_AHEAD = 3;

/**
 * Postgres advisory locks share one global bigint namespace for the whole
 * database, so this key must stay unique among every lock this service ever
 * takes — its exact value is otherwise arbitrary, only its stability across
 * replicas and deploys matters.
 */
export const PARTITION_MAINTENANCE_LOCK_KEY = 84_627_100_1;

interface AdvisoryLockRow {
  readonly acquired: boolean;
}

/**
 * Tops the `task_status_history` partition horizon back up, once a day,
 * across every replica. Guarded by a session-level advisory lock rather than
 * a DB-side scheduler so that when several replicas run this same cron at
 * once, exactly one of them performs the DDL — concurrent
 * `CREATE TABLE ... PARTITION OF` statements for the same range can still
 * race each other in Postgres's catalog even with `IF NOT EXISTS`, so
 * mutual exclusion has to happen before the DDL, not be left to it.
 */
@Injectable()
export class PartitionMaintenanceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly logger: Logger = new Logger(PartitionMaintenanceService.name),
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runScheduledMaintenance(): Promise<void> {
    await this.provisionPartitions();
  }

  /**
   * The maintenance work itself, callable independently of the cron trigger
   * so tests (and, if ever needed, an operator) can run it on demand.
   */
  async provisionPartitions(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const lockAcquired = await this.tryAcquireLock(queryRunner);

      if (!lockAcquired) {
        this.logger.info('Partition maintenance skipped: another replica holds the lock', {
          lockKey: PARTITION_MAINTENANCE_LOCK_KEY,
        });

        return;
      }

      try {
        await this.createMissingPartitions(queryRunner);
      } finally {
        await this.releaseLock(queryRunner);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async tryAcquireLock(queryRunner: QueryRunner): Promise<boolean> {
    const rows = (await queryRunner.query('SELECT pg_try_advisory_lock($1) AS acquired', [
      PARTITION_MAINTENANCE_LOCK_KEY,
    ])) as AdvisoryLockRow[];

    return rows[0]?.acquired ?? false;
  }

  private async releaseLock(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_unlock($1)', [PARTITION_MAINTENANCE_LOCK_KEY]);
  }

  /**
   * `IF NOT EXISTS` makes today's run a no-op wherever yesterday's run (or
   * the initial migration) already provisioned a range — re-running this
   * job the same day, or the same month, must never fail.
   */
  private async createMissingPartitions(queryRunner: QueryRunner): Promise<void> {
    const partitionPlan = buildMonthlyPartitionPlan(
      HISTORY_TABLE_NAME,
      new Date(),
      FUTURE_MONTHS_AHEAD,
    );

    for (const range of partitionPlan) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${range.partitionName} PARTITION OF ${HISTORY_TABLE_NAME}
          FOR VALUES FROM ('${range.rangeStartInclusive}') TO ('${range.rangeEndExclusive}')
      `);
    }
  }
}
