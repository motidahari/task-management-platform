import { Module } from '@nestjs/common';

import { UserDao } from '../domain/user.dao';
import { TaskModule } from '../task/task.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

/**
 * Wires the read-only users transport slice — list and per-user tasks.
 * Imports `TaskModule` solely for the `TaskService` it exports;
 * `UserController` has no direct dependency on any task DAO or
 * type-registry concern.
 */
@Module({
  imports: [TaskModule],
  controllers: [UserController],
  providers: [UserService, UserDao],
})
export class UserModule {}
