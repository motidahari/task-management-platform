import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from '../../../src/health/health.controller';
import type { HealthService } from '../../../src/health/health.service';

function controllerWith(isDatabaseReachable: jest.Mock): HealthController {
  return new HealthController({ isDatabaseReachable } as unknown as HealthService);
}

describe('HealthController', () => {
  describe('Given:a liveness check, When:called', () => {
    it('should answer ok without touching the database', () => {
      const isDatabaseReachable = jest.fn();

      expect(controllerWith(isDatabaseReachable).liveness()).toEqual({ status: 'ok' });
      expect(isDatabaseReachable).not.toHaveBeenCalled();
    });
  });

  describe('Given:the database is reachable, When:checking readiness', () => {
    it('should answer ok', async () => {
      const isDatabaseReachable = jest.fn().mockResolvedValue(true);

      await expect(controllerWith(isDatabaseReachable).readiness()).resolves.toEqual({
        status: 'ok',
      });
    });
  });

  describe('Given:the database is unreachable, When:checking readiness', () => {
    it('should reject with a 503', async () => {
      const isDatabaseReachable = jest.fn().mockResolvedValue(false);

      await expect(controllerWith(isDatabaseReachable).readiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
