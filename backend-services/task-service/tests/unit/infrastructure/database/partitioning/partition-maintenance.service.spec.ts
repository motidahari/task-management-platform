import { Logger } from '@core/shared';
import type { DataSource, QueryRunner } from 'typeorm';

import {
  PARTITION_MAINTENANCE_LOCK_KEY,
  PartitionMaintenanceService,
} from '../../../../../src/infrastructure/database/partitioning/partition-maintenance.service';

const REFERENCE_DATE = new Date('2026-07-30T12:00:00Z');

interface FakeQueryRunner {
  readonly queryRunner: QueryRunner;
  readonly query: jest.Mock;
  readonly release: jest.Mock;
}

function fakeQueryRunner(lockAcquired: boolean): FakeQueryRunner {
  const connect = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) {
      return Promise.resolve([{ acquired: lockAcquired }]);
    }

    return Promise.resolve(undefined);
  });

  return { queryRunner: { connect, query, release } as unknown as QueryRunner, query, release };
}

function fakeDataSource(queryRunner: QueryRunner): DataSource {
  return { createQueryRunner: jest.fn().mockReturnValue(queryRunner) } as unknown as DataSource;
}

function silentLogger(): Logger {
  return new Logger('partition-maintenance.spec', jest.fn());
}

function executedStatements(query: jest.Mock): string[] {
  return query.mock.calls.map(([sql]: [string]) => sql);
}

describe('PartitionMaintenanceService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(REFERENCE_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Given:no other replica holds the maintenance lock, When:provisionPartitions runs', () => {
    it('should create exactly the current month plus 3 future monthly partitions, idempotently and with no DEFAULT partition', async () => {
      const { queryRunner, query } = fakeQueryRunner(true);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      const partitionStatements = executedStatements(query).filter((sql) =>
        sql.includes('PARTITION OF task_status_history'),
      );

      expect(partitionStatements).toHaveLength(4);
      expect(partitionStatements.every((sql) => sql.includes('CREATE TABLE IF NOT EXISTS'))).toBe(
        true,
      );
      expect(partitionStatements.some((sql) => sql.toLowerCase().includes('default'))).toBe(false);
    });

    it('should name and range each partition from the current calendar month forward, tiling with no gap', async () => {
      const { queryRunner, query } = fakeQueryRunner(true);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      const statements = executedStatements(query).join('\n');

      expect(statements).toContain(
        'CREATE TABLE IF NOT EXISTS task_status_history_2026_07 PARTITION OF task_status_history',
      );
      expect(statements).toContain("FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')");
      expect(statements).toContain(
        'CREATE TABLE IF NOT EXISTS task_status_history_2026_10 PARTITION OF task_status_history',
      );
      expect(statements).toContain("FOR VALUES FROM ('2026-10-01') TO ('2026-11-01')");
    });

    it('should acquire and release the same fixed advisory lock key around the DDL', async () => {
      const { queryRunner, query } = fakeQueryRunner(true);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      expect(query).toHaveBeenNthCalledWith(1, 'SELECT pg_try_advisory_lock($1) AS acquired', [
        PARTITION_MAINTENANCE_LOCK_KEY,
      ]);
      expect(query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [
        PARTITION_MAINTENANCE_LOCK_KEY,
      ]);
    });

    it('should always release the query runner back to the pool', async () => {
      const { queryRunner, release } = fakeQueryRunner(true);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      expect(release).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:another replica already holds the maintenance lock, When:provisionPartitions runs', () => {
    it('should back off without issuing any partition DDL', async () => {
      const { queryRunner, query } = fakeQueryRunner(false);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      const partitionStatements = executedStatements(query).filter((sql) =>
        sql.includes('PARTITION OF'),
      );

      expect(partitionStatements).toHaveLength(0);
    });

    it('should still release the query runner back to the pool', async () => {
      const { queryRunner, release } = fakeQueryRunner(false);
      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await service.provisionPartitions();

      expect(release).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:partition creation fails after the lock is acquired, When:provisionPartitions runs', () => {
    it('should still release the advisory lock and the query runner before propagating the error', async () => {
      const { queryRunner, query, release } = fakeQueryRunner(true);
      const failure = new Error('unexpected DDL failure');

      query.mockImplementation((sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) {
          return Promise.resolve([{ acquired: true }]);
        }

        if (sql.includes('PARTITION OF')) {
          return Promise.reject(failure);
        }

        return Promise.resolve(undefined);
      });

      const service = new PartitionMaintenanceService(fakeDataSource(queryRunner), silentLogger());

      await expect(service.provisionPartitions()).rejects.toThrow(failure);

      expect(executedStatements(query)).toContain('SELECT pg_advisory_unlock($1)');
      expect(release).toHaveBeenCalledTimes(1);
    });
  });
});
