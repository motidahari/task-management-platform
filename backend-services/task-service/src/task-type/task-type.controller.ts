import { applyConditionalGet } from '@core/shared';
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { TaskTypeQueryService } from './task-type-query.service';

const HTTP_OK = 200;

/**
 * Serves the task-type registry to the client so it can render creation
 * forms, status steppers, and per-status field forms without a client
 * release whenever a backend type is added.
 *
 * Delegates the conditional-GET mechanics (caching headers, 304 short
 * circuit) to the shared helper — this controller only fetches the body and
 * decides what to send when the client doesn't already have it.
 */
@Controller('task-types')
export class TaskTypeController {
  constructor(private readonly taskTypeQueryService: TaskTypeQueryService) {}

  @Get()
  list(@Req() request: Request, @Res() response: Response): void {
    const body = this.taskTypeQueryService.listAll();

    if (applyConditionalGet(request, response, body)) {
      return;
    }

    response.status(HTTP_OK).json(body);
  }
}
