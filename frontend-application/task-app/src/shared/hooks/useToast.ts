import { useMemo } from 'react';

import { useBus } from '../../core/bus/useBus';

export interface UseToastResult {
  readonly success: (messageKey: string, params?: Record<string, unknown>) => void;
  readonly error: (messageKey: string, params?: Record<string, unknown>) => void;
  readonly info: (messageKey: string, params?: Record<string, unknown>) => void;
}

/**
 * Thin sugar over the bus's `toast:show` event: callers name the kind and
 * their own translation key instead of constructing the event payload by
 * hand. Copy already resolved to plain text (e.g. a mapped server error)
 * still goes straight through `useBus().emit('toast:show', { text, … })` —
 * this hook only covers the client-authored-copy path.
 */
export function useToast(): UseToastResult {
  const { emit } = useBus();

  return useMemo(
    () => ({
      success: (messageKey: string, params?: Record<string, unknown>): void =>
        emit('toast:show', { kind: 'success', messageKey, params }),
      error: (messageKey: string, params?: Record<string, unknown>): void =>
        emit('toast:show', { kind: 'error', messageKey, params }),
      info: (messageKey: string, params?: Record<string, unknown>): void =>
        emit('toast:show', { kind: 'info', messageKey, params }),
    }),
    [emit],
  );
}
