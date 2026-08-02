import { randomUUID } from 'node:crypto';

import type { TaskPageDto } from '../../../src/task/dto/task-page.dto';
import { UserNotFoundException } from '../../../src/task/exception/user-not-found.exception';
import type { UserPageDto } from '../../../src/user/dto/user-page.dto';
import { UserController } from '../../../src/user/user.controller';
import type { UserService } from '../../../src/user/user.service';

const USER_ID = randomUUID();

interface UserServiceMock {
  listUsers: jest.Mock;
  getUserTasks: jest.Mock;
}

function controllerWith(overrides: Partial<UserServiceMock> = {}): {
  controller: UserController;
  userService: UserServiceMock;
} {
  const userService: UserServiceMock = {
    listUsers: jest.fn(),
    getUserTasks: jest.fn(),
    ...overrides,
  };
  const controller = new UserController(userService as unknown as UserService);

  return { controller, userService };
}

describe('UserController', () => {
  describe('Given:a users list request, When:listUsers is called', () => {
    it('should delegate straight to UserService.listUsers without reshaping the result', async () => {
      const userPage: UserPageDto = { items: [], nextCursor: null, limit: 20 };
      const { controller, userService } = controllerWith({
        listUsers: jest.fn().mockResolvedValue(userPage),
      });

      const result = controller.listUsers({ limit: 20 });

      expect(userService.listUsers).toHaveBeenCalledWith({ limit: 20 });
      await expect(result).resolves.toBe(userPage);
    });
  });

  describe('Given:an existing user id, When:getUserTasks is called', () => {
    it('should delegate straight to UserService.getUserTasks without reshaping the result', async () => {
      const taskPage: TaskPageDto = { items: [], nextCursor: null, limit: 20 };
      const { controller, userService } = controllerWith({
        getUserTasks: jest.fn().mockResolvedValue(taskPage),
      });

      const result = controller.getUserTasks(USER_ID, { isClosed: false });

      expect(userService.getUserTasks).toHaveBeenCalledWith(USER_ID, { isClosed: false });
      await expect(result).resolves.toBe(taskPage);
    });
  });

  describe('Given:an unknown user id, When:getUserTasks is called', () => {
    it('should propagate UserNotFoundException rather than swallow it', async () => {
      const { controller } = controllerWith({
        getUserTasks: jest.fn().mockRejectedValue(new UserNotFoundException(USER_ID)),
      });

      await expect(controller.getUserTasks(USER_ID, {})).rejects.toThrow(UserNotFoundException);
    });
  });
});
