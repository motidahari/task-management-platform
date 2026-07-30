import type { Provider } from '@nestjs/common';
import { makeCounterProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';

import {
  REALTIME_EVENTS_PUBLISHED_COUNTER_NAME,
  SOCKET_CONNECTIONS_GAUGE_NAME,
} from '../metrics.constants';

/**
 * The realtime layer (socket gateway, event publisher) does not exist yet.
 * These instruments are registered now, ahead of it, so that layer only ever
 * has to `@InjectMetric(...)` the name below and call `.set()` / `.inc()` —
 * never add a new provider, module import or export.
 */
export const socketConnectionsGaugeProvider: Provider = makeGaugeProvider({
  name: SOCKET_CONNECTIONS_GAUGE_NAME,
  help: 'Currently connected realtime sockets, set by the realtime gateway on connect/disconnect.',
});

export const realtimeEventsPublishedCounterProvider: Provider = makeCounterProvider({
  name: REALTIME_EVENTS_PUBLISHED_COUNTER_NAME,
  help: 'Total realtime events published, incremented by the realtime publisher after each post-commit emit.',
});
