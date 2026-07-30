import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

interface HealthStatus {
  readonly status: 'ok';
}

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness — no I/O. Answers as long as the process can handle a request. */
  @Get('health')
  liveness(): HealthStatus {
    return { status: 'ok' };
  }

  /** Readiness — DB ping only. 503 takes the instance out of LB rotation. */
  @Get('health/ready')
  async readiness(): Promise<HealthStatus> {
    const isDatabaseReachable = await this.healthService.isDatabaseReachable();

    if (!isDatabaseReachable) {
      throw new ServiceUnavailableException('Database is unreachable');
    }

    return { status: 'ok' };
  }
}
