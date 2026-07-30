import { ErrorCode, isAppException } from '@core/shared';

import { TaskNotFoundException } from '../../../../src/task/exception/task-not-found.exception';

describe('TaskNotFoundException', () => {
  describe('Given:a task id absent from the URI, When:the exception is thrown', () => {
    it('should carry the TASK_NOT_FOUND code', () => {
      expect(new TaskNotFoundException('t-1').errorCode).toBe(ErrorCode.TASK_NOT_FOUND);
    });

    it('should map to HTTP 404', () => {
      expect(new TaskNotFoundException('t-1').getStatus()).toBe(404);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new TaskNotFoundException('t-1'))).toBe(true);
    });
  });
});
