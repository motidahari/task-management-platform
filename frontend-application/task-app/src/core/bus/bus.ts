import { createEventBus } from './eventBus';
import type { BusEvents } from './types';

/**
 * The app-wide event bus instance — one per page load. UI-only, fire-and-
 * forget channel (toast/modal control, realtime reconnection signal); domain
 * data always flows through the store/service layers instead.
 */
export const bus = createEventBus<BusEvents>();
