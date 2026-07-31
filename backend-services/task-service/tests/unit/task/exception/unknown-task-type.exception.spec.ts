import { ErrorCode, isAppException } from '@core/shared';

import { UnknownTaskTypeException } from '../../../../src/task/exception/unknown-task-type.exception';

describe('UnknownTaskTypeException', () => {
  describe('Given:a type key not present in the registry, When:the exception is thrown', () => {
    it('should carry the UNKNOWN_TASK_TYPE code', () => {
      expect(new UnknownTaskTypeException('bogus').errorCode).toBe(ErrorCode.UNKNOWN_TASK_TYPE);
    });

    it('should map to HTTP 422', () => {
      expect(new UnknownTaskTypeException('bogus').getStatus()).toBe(422);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new UnknownTaskTypeException('bogus'))).toBe(true);
    });
  });
});
