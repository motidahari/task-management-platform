import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Task } from '../domain/task.model';
import { TaskTypeRegistry } from '../task-type/task-type.registry';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { HistoryPageQueryDto } from './dto/history-page-query.dto';
import type { HistoryPageDto } from './dto/history-page.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { toTaskResponse } from './task-response.mapper';
import { TaskService } from './task.service';

/**
 * Transport slice for the tasks domain. Validates the request in (pipes,
 * DTOs), delegates every business decision to `TaskService`, and reshapes
 * whatever domain model comes back to the wire response via `toResponse` —
 * no business logic lives here. `statusName` is resolved from the registry
 * at this boundary rather than inside the service: the service works with
 * `Task` domain models throughout, and `statusName` only exists for the
 * client-facing shape a `Task` becomes on its way out.
 */
@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskTypeRegistry: TaskTypeRegistry,
  ) {}

  @Post()
  async create(@Body() dto: CreateTaskDto): Promise<TaskResponseDto> {
    const task = await this.taskService.createTask(dto);

    return this.toResponse(task);
  }

  @Get(':id')
  async getById(@Param('id', new ParseUUIDPipe()) taskId: string): Promise<TaskResponseDto> {
    const task = await this.taskService.getById(taskId);

    return this.toResponse(task);
  }

  @Patch(':id/status')
  async changeStatus(
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<TaskResponseDto> {
    const task = await this.taskService.changeStatus(taskId, dto);

    return this.toResponse(task);
  }

  /**
   * Close carries no body and returns the closed resource, not a "created"
   * response — `200`, not `POST`'s default `201`.
   */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id', new ParseUUIDPipe()) taskId: string): Promise<TaskResponseDto> {
    const task = await this.taskService.closeTask(taskId);

    return this.toResponse(task);
  }

  @Get(':id/history')
  getHistory(
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: HistoryPageQueryDto,
  ): Promise<HistoryPageDto> {
    return this.taskService.getHistoryPage(taskId, query);
  }

  private toResponse(task: Task): TaskResponseDto {
    return toTaskResponse(task, this.taskTypeRegistry.statusNameOf(task.type, task.status));
  }
}
