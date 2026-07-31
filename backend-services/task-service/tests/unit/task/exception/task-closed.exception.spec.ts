import { ErrorCode, isAppException } from '@core/shared';

import { TaskClosedException } from '../../../../src/task/exception/task-closed.exception';

describe('TaskClosedException', () => {
  describe('Given:a mutation attempted on a closed task, When:the exception is thrown', () => {
    it('should carry the TASK_CLOSED code', () => {
      expect(new TaskClosedException().errorCode).toBe(ErrorCode.TASK_CLOSED);
    });

    it('should map to HTTP 409', () => {
      expect(new TaskClosedException().getStatus()).toBe(409);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new TaskClosedException())).toBe(true);
    });
  });
});
