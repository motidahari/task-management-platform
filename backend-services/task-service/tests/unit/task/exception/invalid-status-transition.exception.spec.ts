import { ErrorCode, isAppException } from '@core/shared';

import { InvalidStatusTransitionException } from '../../../../src/task/exception/invalid-status-transition.exception';

describe('InvalidStatusTransitionException', () => {
  describe('Given:a move forward past the final status or backward below 1, When:the exception is thrown', () => {
    it('should carry the INVALID_STATUS_TRANSITION code', () => {
      expect(new InvalidStatusTransitionException().errorCode).toBe(
        ErrorCode.INVALID_STATUS_TRANSITION,
      );
    });

    it('should map to HTTP 422', () => {
      expect(new InvalidStatusTransitionException().getStatus()).toBe(422);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new InvalidStatusTransitionException())).toBe(true);
    });
  });
});
