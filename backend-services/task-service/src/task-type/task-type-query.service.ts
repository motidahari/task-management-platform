import { Injectable } from '@nestjs/common';

import type { StatusDefinition } from './interfaces/task-type-definition.interface';
import { TaskTypeRegistry } from './task-type.registry';

export interface TaskTypeMetadata {
  readonly type: string;
  readonly displayName: string;
  readonly finalStatus: number;
  readonly statuses: readonly StatusDefinition[];
}

/**
 * Assembles the client-facing view of the task-type registry: every
 * registered definition plus its `finalStatus`, read straight off the
 * registry rather than recomputed here — the registry is the single place
 * that derives it.
 */
@Injectable()
export class TaskTypeQueryService {
  constructor(private readonly taskTypeRegistry: TaskTypeRegistry) {}

  listAll(): TaskTypeMetadata[] {
    return this.taskTypeRegistry.getAll().map((definition) => ({
      type: definition.type,
      displayName: definition.displayName,
      finalStatus: this.taskTypeRegistry.finalStatusOf(definition.type),
      statuses: definition.statuses,
    }));
  }
}
