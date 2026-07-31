import { useCallback, useEffect, useRef } from 'react';

import { bus } from './bus';
import type { BusEvents, BusHandler } from './types';

export interface UseBusResult {
  readonly emit: typeof bus.emit;
  readonly off: typeof bus.off;
  /** Same as the bus's own `on`, except the subscription is torn down automatically on unmount. */
  readonly on: <TKey extends keyof BusEvents>(
    event: TKey,
    handler: BusHandler<BusEvents[TKey]>,
  ) => () => void;
}

/**
 * Component-scoped handle onto the app-wide bus singleton. `emit`/`off`
 * forward straight to it; `on` additionally tracks every subscription made
 * through this handle and removes them when the owning component unmounts,
 * so callers don't have to return an unsubscribe function from their own
 * effect for the common case.
 */
export function useBus(): UseBusResult {
  const unsubscribersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const unsubscribers = unsubscribersRef.current;
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers.length = 0;
    };
  }, []);

  const on = useCallback<UseBusResult['on']>((event, handler) => {
    const unsubscribe = bus.on(event, handler);
    unsubscribersRef.current.push(unsubscribe);
    return unsubscribe;
  }, []);

  return { emit: bus.emit.bind(bus), off: bus.off.bind(bus), on };
}
