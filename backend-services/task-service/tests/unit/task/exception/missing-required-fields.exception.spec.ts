import { ErrorCode, isAppException } from '@core/shared';

import { MissingRequiredFieldsException } from '../../../../src/task/exception/missing-required-fields.exception';

describe('MissingRequiredFieldsException', () => {
  describe('Given:a forward move missing data required by its target status, When:the exception is thrown', () => {
    it('should carry the MISSING_REQUIRED_FIELDS code', () => {
      expect(new MissingRequiredFieldsException(3, ['branchName']).errorCode).toBe(
        ErrorCode.MISSING_REQUIRED_FIELDS,
      );
    });

    it('should map to HTTP 422', () => {
      expect(new MissingRequiredFieldsException(3, ['branchName']).getStatus()).toBe(422);
    });

    it('should list the missing fields in its details', () => {
      expect(new MissingRequiredFieldsException(3, ['branchName']).details).toEqual({
        missing: ['branchName'],
      });
    });

    it('should be recognized by the filter as a typed exception', () => {
      expect(isAppException(new MissingRequiredFieldsException(3, ['branchName']))).toBe(true);
    });
  });
});
