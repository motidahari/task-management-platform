import type { Gauge } from 'prom-client';
import type { DataSource } from 'typeorm';

import { collectDbPoolGaugeReadings } from '../../../../src/metrics/providers/db-pool-gauge.provider';

function fakeGauge(): { gauge: Gauge<string>; set: jest.Mock } {
  const set = jest.fn();

  return { gauge: { set } as unknown as Gauge<string>, set };
}

function fakeDataSourceWithPool(pool: {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}): DataSource {
  return { driver: { master: pool } } as unknown as DataSource;
}

function fakeDataSourceWithoutPool(): DataSource {
  return { driver: {} } as unknown as DataSource;
}

describe('collectDbPoolGaugeReadings', () => {
  describe('Given:both DataSources expose a live pool, When:the gauge is collected', () => {
    it('should set in-use, idle and waiting readings for each connection', () => {
      const { gauge, set } = fakeGauge();
      const writeDataSource = fakeDataSourceWithPool({
        totalCount: 10,
        idleCount: 6,
        waitingCount: 0,
      });
      const readDataSource = fakeDataSourceWithPool({
        totalCount: 5,
        idleCount: 1,
        waitingCount: 2,
      });

      collectDbPoolGaugeReadings(gauge, writeDataSource, readDataSource);

      expect(set).toHaveBeenCalledWith({ connection: 'write', state: 'in_use' }, 4);
      expect(set).toHaveBeenCalledWith({ connection: 'write', state: 'idle' }, 6);
      expect(set).toHaveBeenCalledWith({ connection: 'write', state: 'waiting' }, 0);
      expect(set).toHaveBeenCalledWith({ connection: 'read', state: 'in_use' }, 4);
      expect(set).toHaveBeenCalledWith({ connection: 'read', state: 'idle' }, 1);
      expect(set).toHaveBeenCalledWith({ connection: 'read', state: 'waiting' }, 2);
    });
  });

  describe('Given:a DataSource whose driver has no live pool yet, When:the gauge is collected', () => {
    it('should skip that connection instead of throwing', () => {
      const { gauge, set } = fakeGauge();
      const writeDataSource = fakeDataSourceWithoutPool();
      const readDataSource = fakeDataSourceWithPool({
        totalCount: 3,
        idleCount: 3,
        waitingCount: 0,
      });

      expect(() =>
        collectDbPoolGaugeReadings(gauge, writeDataSource, readDataSource),
      ).not.toThrow();
      expect(set).not.toHaveBeenCalledWith(
        expect.objectContaining({ connection: 'write' }),
        expect.anything(),
      );
      expect(set).toHaveBeenCalledWith({ connection: 'read', state: 'idle' }, 3);
    });
  });
});
