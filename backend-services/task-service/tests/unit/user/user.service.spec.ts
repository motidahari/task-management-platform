import type { TaskPageDto } from '../../../src/task/dto/task-page.dto';
import { TaskService } from '../../../src/task/task.service';
import { UserDao } from '../../../src/domain/user.dao';
import { User } from '../../../src/domain/user.model';
import { UserNotFoundException } from '../../../src/task/exception/user-not-found.exception';
import { UserService } from '../../../src/user/user.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function fakeUser(overrides: Partial<{ id: string; name: string; email: string }> = {}): User {
  return new User({
    id: overrides.id ?? USER_ID,
    name: overrides.name ?? 'Ada Lovelace',
    email: overrides.email ?? 'ada@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

interface UserDaoMock {
  getById: jest.Mock;
  findPage: jest.Mock;
}

interface TaskServiceMock {
  getTasksPageByAssignee: jest.Mock;
}

function userServiceHarness(
  overrides: Partial<{ userDao: Partial<UserDaoMock>; taskService: Partial<TaskServiceMock> }> = {},
): { service: UserService; userDao: UserDaoMock; taskService: TaskServiceMock } {
  const userDao: UserDaoMock = {
    getById: jest.fn().mockResolvedValue(fakeUser()),
    findPage: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    ...overrides.userDao,
  };
  const taskService: TaskServiceMock = {
    getTasksPageByAssignee: jest.fn(),
    ...overrides.taskService,
  };
  const service = new UserService(
    userDao as unknown as UserDao,
    taskService as unknown as TaskService,
  );

  return { service, userDao, taskService };
}

describe('UserService', () => {
  describe('Given:a page of users, When:listUsers is called', () => {
    it('should map the DAO page to the wire shape', async () => {
      const user = fakeUser({ id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com' });
      const { service } = userServiceHarness({
        userDao: { findPage: jest.fn().mockResolvedValue({ items: [user], nextCursor: null }) },
      });

      const result = await service.listUsers({});

      expect(result.items).toEqual([user.toJSON()]);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('Given:no limit is requested, When:listUsers is called', () => {
    it('should default the page size to 20', async () => {
      const { service, userDao } = userServiceHarness();

      const result = await service.listUsers({});

      expect(userDao.findPage).toHaveBeenCalledWith(20, undefined);
      expect(result.limit).toBe(20);
    });
  });

  describe('Given:a requested limit above the maximum, When:listUsers is called', () => {
    it('should clamp the page size to 100 rather than rejecting the request', async () => {
      const { service, userDao } = userServiceHarness();

      const result = await service.listUsers({ limit: 500 });

      expect(userDao.findPage).toHaveBeenCalledWith(100, undefined);
      expect(result.limit).toBe(100);
    });
  });

  describe('Given:a requested limit within range, When:listUsers is called', () => {
    it('should pass it through unchanged', async () => {
      const { service, userDao } = userServiceHarness();

      const result = await service.listUsers({ limit: 5 });

      expect(userDao.findPage).toHaveBeenCalledWith(5, undefined);
      expect(result.limit).toBe(5);
    });
  });

  describe('Given:a cursor is requested, When:listUsers is called', () => {
    it('should pass it straight through to the DAO', async () => {
      const { service, userDao } = userServiceHarness();

      await service.listUsers({ cursor: 'incoming-cursor' });

      expect(userDao.findPage).toHaveBeenCalledWith(20, 'incoming-cursor');
    });
  });

  describe('Given:no user exists for the id, When:getUserTasks is called', () => {
    it('should reject with UserNotFoundException without paging tasks', async () => {
      const { service, userDao, taskService } = userServiceHarness({
        userDao: {
          getById: jest.fn().mockRejectedValue(new UserNotFoundException('missing-user')),
        },
      });

      await expect(service.getUserTasks('missing-user', {})).rejects.toThrow(UserNotFoundException);

      expect(userDao.getById).toHaveBeenCalledWith('missing-user');
      expect(taskService.getTasksPageByAssignee).not.toHaveBeenCalled();
    });
  });

  describe('Given:an existing user, When:getUserTasks is called', () => {
    it('should delegate the page entirely to TaskService', async () => {
      const taskPage: TaskPageDto = { items: [], nextCursor: null, limit: 20 };
      const { service, userDao, taskService } = userServiceHarness({
        taskService: { getTasksPageByAssignee: jest.fn().mockResolvedValue(taskPage) },
      });
      const query = { isClosed: false, limit: 10, cursor: 'incoming-cursor' };

      const result = await service.getUserTasks(USER_ID, query);

      expect(userDao.getById).toHaveBeenCalledWith(USER_ID);
      expect(taskService.getTasksPageByAssignee).toHaveBeenCalledWith(USER_ID, query);
      expect(result).toBe(taskPage);
    });
  });
});
