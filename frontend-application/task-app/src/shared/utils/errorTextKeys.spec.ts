import { ErrorCode } from '@core/shared/error-codes';
import { describe, expect, it } from 'vitest';

import { ERROR_TEXT_KEYS } from './errorTextKeys';

describe('ERROR_TEXT_KEYS', () => {
  describe('Given:every registered ErrorCode member', () => {
    it('should map every code except INTERNAL_ERROR to a translation key', () => {
      const codesRequiringCopy = Object.values(ErrorCode)
        .filter((value): value is ErrorCode => typeof value === 'number')
        .filter((code) => code !== ErrorCode.INTERNAL_ERROR);

      codesRequiringCopy.forEach((code) => {
        expect(ERROR_TEXT_KEYS[code]).toEqual(expect.any(String));
      });
    });

    it('should leave INTERNAL_ERROR unmapped so it falls through to the generic copy', () => {
      expect(ERROR_TEXT_KEYS[ErrorCode.INTERNAL_ERROR]).toBeUndefined();
    });
  });
});
