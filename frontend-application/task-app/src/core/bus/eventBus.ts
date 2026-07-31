import type { BusHandler } from './types';

export interface TypedEventBus<TEvents> {
  /** Registers `handler` for `event` and returns a function that removes it. */
  on<TKey extends keyof TEvents>(event: TKey, handler: BusHandler<TEvents[TKey]>): () => void;
  off<TKey extends keyof TEvents>(event: TKey, handler: BusHandler<TEvents[TKey]>): void;
  emit<TKey extends keyof TEvents>(
    event: TKey,
    ...payload: TEvents[TKey] extends void ? [] : [TEvents[TKey]]
  ): void;
}

/**
 * A minimal mitt-style pub/sub: one `Set` of handlers per event key, no
 * dependencies. A factory rather than a ready-made class instance so the
 * mechanism is testable on its own, decoupled from the app-wide singleton it
 * backs (see `bus.ts`).
 *
 * The internal `Set<BusHandler<unknown>>` storage can't carry a distinct
 * payload type per key at the type level (a single `Map` holds every event),
 * so the casts below narrow back to the caller's event-specific type; the
 * public `on`/`off`/`emit` signatures are what keep call sites type-safe.
 */
export function createEventBus<TEvents extends object>(): TypedEventBus<TEvents> {
  const handlersByEvent = new Map<keyof TEvents, Set<BusHandler<unknown>>>();

  function handlersFor(event: keyof TEvents): Set<BusHandler<unknown>> {
    const existing = handlersByEvent.get(event);
    if (existing) return existing;

    const created = new Set<BusHandler<unknown>>();
    handlersByEvent.set(event, created);
    return created;
  }

  return {
    on(event, handler) {
      const handlers = handlersFor(event);
      const untypedHandler = handler as unknown as BusHandler<unknown>;
      handlers.add(untypedHandler);
      return () => handlers.delete(untypedHandler);
    },

    off(event, handler) {
      handlersFor(event).delete(handler as unknown as BusHandler<unknown>);
    },

    emit(event, ...payload) {
      const handlers = handlersByEvent.get(event);
      if (!handlers) return;

      const [value] = payload;
      for (const handler of [...handlers]) handler(value);
    },
  };
}
