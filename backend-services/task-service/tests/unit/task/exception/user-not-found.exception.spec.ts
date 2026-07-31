import { ErrorCode, isAppException } from '@core/shared';

import { UserNotFoundException } from '../../../../src/task/exception/user-not-found.exception';

describe('UserNotFoundException', () => {
  describe('Given:a user id absent from the URI, When:the exception is thrown', () => {
    it('should carry the USER_NOT_FOUND code', () => {
      expect(new UserNotFoundException('u-1').errorCode).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should map to HTTP 404', () => {
      expect(new UserNotFoundException('u-1').getStatus()).toBe(404);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new UserNotFoundException('u-1'))).toBe(true);
    });
  });
});
