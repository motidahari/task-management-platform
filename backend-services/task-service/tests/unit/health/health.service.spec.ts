import { Logger, type LogSink } from '@core/shared';
import type { DataSource } from 'typeorm';

import { HealthService } from '../../../src/health/health.service';

function healthServiceWith(query: jest.Mock): HealthService {
  // Capturing sink so a deliberately-triggered failure in this suite doesn't
  // print a warning line into the test run's own output.
  const sink: LogSink = () => {};

  return new HealthService({ query } as unknown as DataSource, new Logger('HealthService', sink));
}

describe('HealthService', () => {
  describe('Given:the database answers the probe query, When:checking readiness', () => {
    it('should report the database reachable', async () => {
      const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

      await expect(healthServiceWith(query).isDatabaseReachable()).resolves.toBe(true);
    });

    it('should probe with a trivial SELECT', async () => {
      const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

      await healthServiceWith(query).isDatabaseReachable();

      expect(query).toHaveBeenCalledWith('SELECT 1');
    });
  });

  describe('Given:the database query throws, When:checking readiness', () => {
    it('should report the database unreachable instead of throwing', async () => {
      const query = jest.fn().mockRejectedValue(new Error('connection refused'));

      await expect(healthServiceWith(query).isDatabaseReachable()).resolves.toBe(false);
    });
  });
});
