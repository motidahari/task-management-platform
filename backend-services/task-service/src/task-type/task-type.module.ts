import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { TASK_TYPE_DEFINITION_CLASSES } from './definitions';
import {
  ALL_TASK_TYPE_DEFINITIONS,
  type TaskTypeDefinition,
} from './interfaces/task-type-definition.interface';
import { TaskTypeRegistry } from './task-type.registry';

const allTaskTypeDefinitionsProvider: Provider = {
  provide: ALL_TASK_TYPE_DEFINITIONS,
  useFactory: (...definitions: TaskTypeDefinition[]): TaskTypeDefinition[] => definitions,
  inject: [...TASK_TYPE_DEFINITION_CLASSES],
};

/**
 * `TASK_TYPE_DEFINITION_CLASSES` is the single registration point: both the
 * `providers` list below and the aggregation factory's `inject` list are
 * derived from it, so a definition class registered as a provider is always
 * injected into `ALL_TASK_TYPE_DEFINITIONS` and vice versa — editing only
 * one of the two lists is not a mistake this module lets you make, because
 * there is only one list.
 *
 * `ALL_TASK_TYPE_DEFINITIONS` is exported by token so a downstream registry
 * can inject the aggregate without this module changing.
 */
@Module({
  providers: [...TASK_TYPE_DEFINITION_CLASSES, allTaskTypeDefinitionsProvider, TaskTypeRegistry],
  exports: [ALL_TASK_TYPE_DEFINITIONS, TaskTypeRegistry],
})
export class TaskTypeModule {}
