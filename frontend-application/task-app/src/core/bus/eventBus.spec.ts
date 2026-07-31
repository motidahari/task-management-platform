import { describe, expect, it, vi } from 'vitest';

import { createEventBus } from './eventBus';

interface TestEvents {
  ping: { count: number };
  pong: void;
}

describe('createEventBus, Given:a handler registered for an event', () => {
  it('should call the handler with the emitted payload', () => {
    const testBus = createEventBus<TestEvents>();
    const handler = vi.fn();

    testBus.on('ping', handler);
    testBus.emit('ping', { count: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ count: 1 });
  });

  it('should notify every handler registered for the same event', () => {
    const testBus = createEventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();

    testBus.on('ping', first);
    testBus.on('ping', second);
    testBus.emit('ping', { count: 2 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith({ count: 2 });
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({ count: 2 });
  });

  it('should not call a handler registered for a different event', () => {
    const testBus = createEventBus<TestEvents>();
    const pingHandler = vi.fn();

    testBus.on('ping', pingHandler);
    testBus.emit('pong');

    expect(pingHandler).not.toHaveBeenCalled();
  });
});

describe('createEventBus, Given:an event emitted with no registered handlers', () => {
  it('should not throw', () => {
    const testBus = createEventBus<TestEvents>();

    expect(() => testBus.emit('ping', { count: 1 })).not.toThrow();
  });
});

describe('createEventBus, Given:a void-payload event', () => {
  it('should call the handler with no arguments to pass through', () => {
    const testBus = createEventBus<TestEvents>();
    const handler = vi.fn();

    testBus.on('pong', handler);
    testBus.emit('pong');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(undefined);
  });
});

describe('createEventBus, Given:a handler removed via the unsubscribe function on() returns', () => {
  it('should stop receiving further emissions', () => {
    const testBus = createEventBus<TestEvents>();
    const handler = vi.fn();

    const unsubscribe = testBus.on('ping', handler);
    unsubscribe();
    testBus.emit('ping', { count: 3 });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('createEventBus, Given:a handler removed via off()', () => {
  it('should stop receiving further emissions', () => {
    const testBus = createEventBus<TestEvents>();
    const handler = vi.fn();

    testBus.on('ping', handler);
    testBus.off('ping', handler);
    testBus.emit('ping', { count: 4 });

    expect(handler).not.toHaveBeenCalled();
  });
});
