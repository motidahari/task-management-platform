import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { HistoryPageQueryDto } from './dto/history-page-query.dto';
import type { HistoryPageDto } from './dto/history-page.dto';
import { TaskService } from './task.service';

/**
 * Read-only transport slice for a task's status-transition timeline — the
 * audit trail every status change writes. The existence gate and the paging
 * itself both live in `TaskService`; this handler only validates the
 * request in and reshapes the domain page into the wire response out.
 */
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get(':id/history')
  async getHistory(
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: HistoryPageQueryDto,
  ): Promise<HistoryPageDto> {
    const page = await this.taskService.getHistoryPage(taskId, query);

    return {
      items: page.items.map((entry) => ({
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        assignedUserId: entry.assignedUserId,
        fieldsSnapshot: entry.fieldsSnapshot,
        createdAt: entry.createdAt,
      })),
      nextCursor: page.nextCursor,
      limit: page.limit,
    };
  }
}
