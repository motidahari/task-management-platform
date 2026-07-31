import { ErrorCode } from '@core/shared/error-codes';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { ApiError } from '../../core/types/api-error';
import { resolveErrorText } from './resolveErrorText';

function fakeTranslate(): TFunction {
  return vi.fn((key: string) => key) as unknown as TFunction;
}

describe('resolveErrorText', () => {
  describe('Given:a network failure with no response envelope', () => {
    it('should resolve to the generic network copy regardless of the carried error code', () => {
      const translate = fakeTranslate();
      const apiError: ApiError = {
        errorCode: ErrorCode.INTERNAL_ERROR,
        status: 0,
        isNetworkError: true,
      };

      const text = resolveErrorText(apiError, translate);

      expect(text).toBe('shared-errors.network');
    });
  });

  describe('Given:a server error code with client-owned copy', () => {
    it('should resolve to that code’s mapped translation key', () => {
      const translate = fakeTranslate();
      const apiError: ApiError = {
        errorCode: ErrorCode.TASK_STATE_CONFLICT,
        status: 409,
        isNetworkError: false,
      };

      const text = resolveErrorText(apiError, translate);

      expect(text).toBe('shared-errors.task-changed');
    });
  });

  describe('Given:INTERNAL_ERROR', () => {
    it('should resolve to the generic copy rather than any server-authored text', () => {
      const translate = fakeTranslate();
      const apiError: ApiError = {
        errorCode: ErrorCode.INTERNAL_ERROR,
        status: 500,
        isNetworkError: false,
      };

      const text = resolveErrorText(apiError, translate);

      expect(text).toBe('shared-errors.generic');
    });
  });

  describe('Given:an out-of-range code with no mapping', () => {
    it('should resolve to the generic copy instead of leaving the toast unresolved', () => {
      const translate = fakeTranslate();
      const apiError: ApiError = {
        errorCode: 99999 as ErrorCode,
        status: 400,
        isNetworkError: false,
      };

      const text = resolveErrorText(apiError, translate);

      expect(text).toBe('shared-errors.generic');
    });
  });
});
