import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { bus } from './bus';
import { useBus } from './useBus';

describe('useBus, Given:a subscription made through the hook while the component is mounted', () => {
  it('should call the handler when the event is emitted', () => {
    const { result } = renderHook(() => useBus());
    const handler = vi.fn();

    result.current.on('realtime:reconnected', handler);
    bus.emit('realtime:reconnected');

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('useBus, Given:the owning component has unmounted', () => {
  it('should no longer call handlers registered through that instance', () => {
    const { result, unmount } = renderHook(() => useBus());
    const handler = vi.fn();

    result.current.on('realtime:reconnected', handler);
    unmount();
    bus.emit('realtime:reconnected');

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useBus, Given:a handler unsubscribed early via the function on() returns', () => {
  it('should stop receiving emissions before the component unmounts', () => {
    const { result } = renderHook(() => useBus());
    const handler = vi.fn();

    const unsubscribe = result.current.on('realtime:reconnected', handler);
    unsubscribe();
    bus.emit('realtime:reconnected');

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useBus, Given:emit called through the hook', () => {
  it('should forward to the app-wide bus and reach listeners registered outside the hook', () => {
    const { result } = renderHook(() => useBus());
    const handler = vi.fn();
    const unsubscribe = bus.on('realtime:reconnected', handler);

    result.current.emit('realtime:reconnected');
    unsubscribe();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
