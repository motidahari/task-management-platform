import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bus } from '../../core/bus/bus';
import { useToast } from './useToast';

describe('useToast, Given:success() called with a message key', () => {
  it('should emit a toast:show event carrying the key and kind success', () => {
    const { result } = renderHook(() => useToast());
    const handler = vi.fn();
    const unsubscribe = bus.on('toast:show', handler);

    result.current.success('some.key', { count: 1 });
    unsubscribe();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      kind: 'success',
      messageKey: 'some.key',
      params: { count: 1 },
    });
  });
});

describe('useToast, Given:error() called with a message key', () => {
  it('should emit a toast:show event carrying the key and kind error', () => {
    const { result } = renderHook(() => useToast());
    const handler = vi.fn();
    const unsubscribe = bus.on('toast:show', handler);

    result.current.error('some.error-key');
    unsubscribe();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      kind: 'error',
      messageKey: 'some.error-key',
      params: undefined,
    });
  });
});

describe('useToast, Given:info() called with a message key', () => {
  it('should emit a toast:show event carrying the key and kind info', () => {
    const { result } = renderHook(() => useToast());
    const handler = vi.fn();
    const unsubscribe = bus.on('toast:show', handler);

    result.current.info('some.info-key');
    unsubscribe();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      kind: 'info',
      messageKey: 'some.info-key',
      params: undefined,
    });
  });
});
