import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { bus } from '../../core/bus/bus';
import { useToast } from './useToast';

interface ToastHarness {
  toast: ReturnType<typeof useToast>;
  handler: Mock;
  unsubscribe: () => void;
}

describe('useToast', () => {
  const renderUseToast = (): ToastHarness => {
    const { result } = renderHook(() => useToast());
    const handler = vi.fn();
    const unsubscribe = bus.on('toast:show', handler);

    return { toast: result.current, handler, unsubscribe };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:success() called with a message key', () => {
    it('should emit a toast:show event carrying the key and kind success', () => {
      const { toast, handler, unsubscribe } = renderUseToast();

      toast.success('some.key', { count: 1 });
      unsubscribe();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        kind: 'success',
        messageKey: 'some.key',
        params: { count: 1 },
      });
    });
  });

  describe('Given:error() called with a message key', () => {
    it('should emit a toast:show event carrying the key and kind error', () => {
      const { toast, handler, unsubscribe } = renderUseToast();

      toast.error('some.error-key');
      unsubscribe();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        kind: 'error',
        messageKey: 'some.error-key',
        params: undefined,
      });
    });
  });

  describe('Given:info() called with a message key', () => {
    it('should emit a toast:show event carrying the key and kind info', () => {
      const { toast, handler, unsubscribe } = renderUseToast();

      toast.info('some.info-key');
      unsubscribe();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        kind: 'info',
        messageKey: 'some.info-key',
        params: undefined,
      });
    });
  });
});
