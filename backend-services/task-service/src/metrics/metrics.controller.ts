import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import type { Response } from 'express';

/**
 * A scrape target is polled on its own fixed schedule, often far more often
 * than any real client — the global throttler guard must never reject it.
 * Overriding `index` (rather than reusing the base controller directly) is
 * required for Nest to see this class's own route: it scans each
 * controller's own prototype for `@Get()` metadata, not its parent's.
 */
@SkipThrottle()
@Controller()
export class MetricsController extends PrometheusController {
  @Get()
  override index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
