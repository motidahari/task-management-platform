import { Module } from '@nestjs/common';

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
 */
@Module({
  imports: [TaskTypeModule],
  controllers: [TaskController],
  providers: [TaskService, TaskWriteDao, TaskStatusHistoryWriteDao, AssigneeExistenceDao],
  exports: [TaskService],
})
export class TaskModule {}
