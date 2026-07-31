import { Module } from '@nestjs/common';

import { TaskTypeModule } from '../task-type/task-type.module';
import { AssigneeExistenceDao } from './dao/assignee-existence.dao';
import { TaskStatusHistoryWriteDao } from './dao/task-status-history-write.dao';
import { TaskWriteDao } from './dao/task-write.dao';
import { TaskService } from './task.service';

/**
 * Wires the tasks write funnel — `TaskService` plus the DAOs and the
 * task-type registry it depends on. No controller yet: the HTTP surface is
 * a separate slice.
 */
@Module({
  imports: [TaskTypeModule],
  providers: [TaskService, TaskWriteDao, TaskStatusHistoryWriteDao, AssigneeExistenceDao],
  exports: [TaskService],
})
export class TaskModule {}
