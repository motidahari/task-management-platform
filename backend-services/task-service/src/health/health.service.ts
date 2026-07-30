import { Logger } from '@core/shared';
import { Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

const READINESS_PROBE_QUERY = 'SELECT 1';

/**
 * Readiness is DB-only by design — Redis carries realtime fan-out and
 * throttler counters, both of which degrade gracefully; gating readiness on
 * it would let a transport-only outage take the whole API out of
 * load-balancer rotation.
 */
@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly writeDataSource: DataSource,
    @Optional() private readonly logger: Logger = new Logger(HealthService.name),
  ) {}

  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.writeDataSource.query(READINESS_PROBE_QUERY);

      return true;
    } catch (error) {
      this.logger.warn('Readiness probe failed', { error });

      return false;
    }
  }
}
