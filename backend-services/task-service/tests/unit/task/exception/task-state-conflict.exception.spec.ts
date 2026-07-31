import { ErrorCode, isAppException } from '@core/shared';

import { TaskStateConflictException } from '../../../../src/task/exception/task-state-conflict.exception';

describe('TaskStateConflictException', () => {
  describe('Given:an expectedStatus that no longer matches the task, When:the exception is thrown', () => {
    it('should carry the TASK_STATE_CONFLICT code', () => {
      expect(new TaskStateConflictException(2).errorCode).toBe(ErrorCode.TASK_STATE_CONFLICT);
    });

    it('should map to HTTP 409', () => {
      expect(new TaskStateConflictException(2).getStatus()).toBe(409);
    });

    it('should carry the current status in its details', () => {
      expect(new TaskStateConflictException(2).details).toEqual({ currentStatus: 2 });
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new TaskStateConflictException(2))).toBe(true);
    });
  });
});
