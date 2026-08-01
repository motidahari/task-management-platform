import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import type { TaskPageDto } from '../task/dto/task-page.dto';
import { TasksPageQueryDto } from '../task/dto/tasks-page-query.dto';
import type { UserPageDto } from './dto/user-page.dto';
import { UsersPageQueryDto } from './dto/users-page-query.dto';
import { UserService } from './user.service';

/**
 * Transport slice for the users domain. Validates the request in (pipes,
 * DTOs) and delegates every business decision to `UserService` — no
 * business logic lives here.
 */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  listUsers(@Query() query: UsersPageQueryDto): Promise<UserPageDto> {
    return this.userService.listUsers(query);
  }

  @Get(':id/tasks')
  getUserTasks(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query() query: TasksPageQueryDto,
  ): Promise<TaskPageDto> {
    return this.userService.getUserTasks(userId, query);
  }
}
