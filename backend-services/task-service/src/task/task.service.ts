import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { Task } from '../domain/task.model';
import { TaskTypeRegistry } from '../task-type/task-type.registry';
import { AssigneeExistenceDao } from './dao/assignee-existence.dao';
import { TaskStatusHistoryWriteDao } from './dao/task-status-history-write.dao';
import { TaskWriteDao } from './dao/task-write.dao';
import { CreateTaskDto } from './dto/create-task.dto';
import { AssigneeNotFoundException } from './exception/assignee-not-found.exception';
import { UnknownTaskTypeException } from './exception/unknown-task-type.exception';

/**
 * Single write funnel for the tasks domain. Every mutation opens its own
 * explicit transaction here — `createTask` included: it writes two rows
 * (the task and its creation history entry) that must commit together, or
 * neither survives. Nothing is locked, since the row does not exist until
 * this call creates it; the transaction buys atomicity between the two
 * inserts, not serialization against a concurrent writer.
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly taskDao: TaskWriteDao,
    private readonly taskStatusHistoryDao: TaskStatusHistoryWriteDao,
    private readonly assigneeExistenceDao: AssigneeExistenceDao,
    private readonly taskTypeRegistry: TaskTypeRegistry,
  ) {}

  async createTask(dto: CreateTaskDto): Promise<Task> {
    return this.dataSource.transaction(async (manager) => {
      if (!this.taskTypeRegistry.findByType(dto.type)) {
        throw new UnknownTaskTypeException(dto.type);
      }

      if (!(await this.assigneeExistenceDao.existsById(dto.assignedUserId, manager))) {
        throw new AssigneeNotFoundException(dto.assignedUserId);
      }

      const task = await this.taskDao.create(
        { type: dto.type, assignedUserId: dto.assignedUserId },
        manager,
      );

      await this.taskStatusHistoryDao.append(
        {
          taskId: task.id,
          fromStatus: null,
          toStatus: task.status,
          assignedUserId: task.assignedUserId,
          fieldsSnapshot: {},
        },
        manager,
      );

      return task;
    });
  }
}
