import { ErrorCode, isAppException } from '@core/shared';

import { TaskNotAtFinalStatusException } from '../../../../src/task/exception/task-not-at-final-status.exception';

describe('TaskNotAtFinalStatusException', () => {
  describe('Given:a close request on a task not yet at its final status, When:the exception is thrown', () => {
    it('should carry the TASK_NOT_AT_FINAL_STATUS code', () => {
      expect(new TaskNotAtFinalStatusException().errorCode).toBe(
        ErrorCode.TASK_NOT_AT_FINAL_STATUS,
      );
    });

    it('should map to HTTP 422', () => {
      expect(new TaskNotAtFinalStatusException().getStatus()).toBe(422);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new TaskNotAtFinalStatusException())).toBe(true);
    });
  });
});
