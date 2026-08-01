import { Module } from '@nestjs/common';

import { RealtimeModule } from '../realtime/realtime.module';
import { TaskTypeModule } from '../task-type/task-type.module';
import { AssigneeExistenceDao } from './dao/assignee-existence.dao';
import { TaskStatusHistoryWriteDao } from './dao/task-status-history-write.dao';
import { TaskWriteDao } from './dao/task-write.dao';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

/**
 * Wires the full tasks transport slice — create, read, status change, close
 * and history. `TaskController` depends on `TaskService` for every business
 * decision and on `TaskTypeRegistry` (exported by `TaskTypeModule`) only to
 * resolve a status name for the wire response, the one piece of translation
 * that belongs at the controller boundary rather than inside the service.
 * `RealtimeModule` is imported so `TaskService` can inject `TaskEventsPublisher`
 * and emit a realtime event after each mutation commits.
 */
@Module({
  imports: [TaskTypeModule, RealtimeModule],
  controllers: [TaskController],
  providers: [TaskService, TaskWriteDao, TaskStatusHistoryWriteDao, AssigneeExistenceDao],
  exports: [TaskService],
})
export class TaskModule {}
