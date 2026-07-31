import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { HistoryPageQueryDto } from './dto/history-page-query.dto';
import type { HistoryPageDto } from './dto/history-page.dto';
import { TaskService } from './task.service';

/**
 * Read-only transport slice for a task's status-transition timeline — the
 * audit trail every status change writes. Validates the request in and hands
 * the wire response straight back from `TaskService`, which owns the existence
 * gate, the paging, and the response shape.
 */
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get(':id/history')
  getHistory(
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: HistoryPageQueryDto,
  ): Promise<HistoryPageDto> {
    return this.taskService.getHistoryPage(taskId, query);
  }
}
