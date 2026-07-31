import { ConditionalGet } from '@core/shared';
import { Controller, Get } from '@nestjs/common';

import { TaskTypeMetadata, TaskTypeQueryService } from './task-type-query.service';

/**
 * Serves the task-type registry to the client so it can render creation
 * forms, status steppers, and per-status field forms without a client
 * release whenever a backend type is added. Caching (headers, ETag, the 304
 * short circuit) is the interceptor's concern, applied declaratively —
 * this handler only fetches and returns the body, like any other endpoint.
 */
@Controller('task-types')
export class TaskTypeController {
  constructor(private readonly taskTypeQueryService: TaskTypeQueryService) {}

  @Get()
  @ConditionalGet()
  list(): TaskTypeMetadata[] {
    return this.taskTypeQueryService.listAll();
  }
}
