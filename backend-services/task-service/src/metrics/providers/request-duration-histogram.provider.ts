import type { Provider } from '@nestjs/common';
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

import { REQUEST_DURATION_HISTOGRAM_NAME } from '../metrics.constants';

/**
 * One observation per request, recorded by the global request-duration
 * interceptor. `prom-client`'s default bucket boundaries (5ms–10s) already
 * cover this service's expected latencies, so there is no need for a bespoke
 * set. Labelled by the matched route template, never the raw URL, to keep
 * the series count bounded regardless of how many distinct ids appear in
 * request paths.
 */
export const requestDurationHistogramProvider: Provider = makeHistogramProvider({
  name: REQUEST_DURATION_HISTOGRAM_NAME,
  help: 'HTTP request duration in seconds, labelled by method, matched route and status code.',
  labelNames: ['method', 'route', 'status_code'],
});
