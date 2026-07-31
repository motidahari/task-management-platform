import { ErrorCode, isAppException } from '@core/shared';

import { AssigneeNotFoundException } from '../../../../src/task/exception/assignee-not-found.exception';

describe('AssigneeNotFoundException', () => {
  describe('Given:a body-referenced user id that does not exist, When:the exception is thrown', () => {
    it('should carry the ASSIGNEE_NOT_FOUND code', () => {
      expect(new AssigneeNotFoundException('u-1').errorCode).toBe(ErrorCode.ASSIGNEE_NOT_FOUND);
    });

    it('should map to HTTP 422, not 404, since the URI resource itself exists', () => {
      expect(new AssigneeNotFoundException('u-1').getStatus()).toBe(422);
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new AssigneeNotFoundException('u-1'))).toBe(true);
    });
  });
});
