import { Module } from '@nestjs/common';

import { TaskTypeModule } from '../task-type/task-type.module';
import { AssigneeExistenceDao } from './dao/assignee-existence.dao';
import { TaskStatusHistoryWriteDao } from './dao/task-status-history-write.dao';
import { TaskWriteDao } from './dao/task-write.dao';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

/**
 * Wires the tasks write funnel plus the one read endpoint served so far — a
 * task's history page. `TaskController` depends only on `TaskService`, same
 * as every other transport slice in this codebase.
 */
@Module({
  imports: [TaskTypeModule],
  controllers: [TaskController],
  providers: [TaskService, TaskWriteDao, TaskStatusHistoryWriteDao, AssigneeExistenceDao],
  exports: [TaskService],
})
export class TaskModule {}
