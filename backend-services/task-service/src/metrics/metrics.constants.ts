/**
 * Every custom metric name in this service starts with this prefix — the
 * prometheus naming convention groups every signal a scrape produces for
 * this service under one recognizable namespace.
 */
const METRICS_NAMESPACE = 'task_service';

export const REQUEST_DURATION_HISTOGRAM_NAME = `${METRICS_NAMESPACE}_http_request_duration_seconds`;
export const DB_POOL_CONNECTIONS_GAUGE_NAME = `${METRICS_NAMESPACE}_db_pool_connections`;
export const SOCKET_CONNECTIONS_GAUGE_NAME = `${METRICS_NAMESPACE}_socket_connections`;
export const REALTIME_EVENTS_PUBLISHED_COUNTER_NAME = `${METRICS_NAMESPACE}_realtime_events_published_total`;
