import { createHash } from 'node:crypto';

import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import type { StatusDefinition } from './interfaces/task-type-definition.interface';
import { TaskTypeRegistry } from './task-type.registry';

const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const IF_NONE_MATCH_HEADER = 'if-none-match';

interface TaskTypeMetadata {
  readonly type: string;
  readonly displayName: string;
  readonly finalStatus: number;
  readonly statuses: readonly StatusDefinition[];
}

/**
 * Serves the task-type registry to the client so it can render creation
 * forms, status steppers, and per-status field forms without a client
 * release whenever a backend type is added — the response is exactly the
 * registered definitions plus the one value the registry derives
 * (`finalStatus`), never recomputed here.
 *
 * The set of registered types only ever changes on deploy, not per request,
 * so `Cache-Control: no-cache` plus an `ETag` lets an unchanged deployment
 * answer with an empty-body 304 instead of re-sending the same payload on
 * every fetch, while a fresh deployment is still visible on the client's very
 * next request — a fixed `max-age` window could not offer that combination.
 *
 * Uses the manual `@Res()` response (no `passthrough`) because a 304 must
 * carry no body at all: letting Nest's standard response handling run
 * afterwards would still attempt to write one.
 */
@Controller('task-types')
export class TaskTypeController {
  constructor(private readonly taskTypeRegistry: TaskTypeRegistry) {}

  @Get()
  list(@Req() request: Request, @Res() response: Response): void {
    const body = this.buildResponseBody();
    const etag = etagOf(body);

    response.set('Cache-Control', 'no-cache');
    response.set('ETag', etag);

    if (request.headers[IF_NONE_MATCH_HEADER] === etag) {
      response.status(HTTP_NOT_MODIFIED).end();
      return;
    }

    response.status(HTTP_OK).json(body);
  }

  private buildResponseBody(): TaskTypeMetadata[] {
    return this.taskTypeRegistry.getAll().map((definition) => ({
      type: definition.type,
      displayName: definition.displayName,
      finalStatus: this.taskTypeRegistry.finalStatusOf(definition.type),
      statuses: definition.statuses,
    }));
  }
}

/**
 * A weak content hash, not a version counter — the registry never changes
 * within a running process, only across deployments, so there is no state to
 * track between requests: the same body always yields the same tag, and any
 * body change (a new or edited definition) always yields a different one.
 */
function etagOf(body: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  return `"${digest}"`;
}
