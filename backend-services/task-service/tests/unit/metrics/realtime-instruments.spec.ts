import { Test } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge } from 'prom-client';

import {
  REALTIME_EVENTS_PUBLISHED_COUNTER_NAME,
  SOCKET_CONNECTIONS_GAUGE_NAME,
} from '../../../src/metrics/metrics.constants';
import {
  realtimeEventsPublishedCounterProvider,
  socketConnectionsGaugeProvider,
} from '../../../src/metrics/providers/realtime-instruments.provider';

/**
 * The realtime layer that will eventually set/increment these instruments
 * does not exist yet — this only pins that both are registered and
 * resolvable by the token a future consumer will `@InjectMetric` with.
 */
describe('Realtime metric instruments', () => {
  describe('Given:the socket-connections gauge provider, When:resolved through Nest DI', () => {
    it('should be injectable as a real prom-client Gauge', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [socketConnectionsGaugeProvider],
      }).compile();

      const gauge = moduleRef.get<Gauge<string>>(getToken(SOCKET_CONNECTIONS_GAUGE_NAME));

      expect(gauge).toBeInstanceOf(Gauge);
    });
  });

  describe('Given:the realtime-events-published counter provider, When:resolved through Nest DI', () => {
    it('should be injectable as a real prom-client Counter', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [realtimeEventsPublishedCounterProvider],
      }).compile();

      const counter = moduleRef.get<Counter<string>>(
        getToken(REALTIME_EVENTS_PUBLISHED_COUNTER_NAME),
      );

      expect(counter).toBeInstanceOf(Counter);
    });
  });
});
