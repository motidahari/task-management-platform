/**
 * Single-parse-point for environment-derived configuration: every other
 * module reads {@link appConfig} instead of touching `import.meta.env`
 * directly, so swapping the backend host/port stays a one-variable change.
 *
 * A missing value is surfaced through {@link configError} rather than thrown at
 * import time — a throw here runs during module evaluation and takes the whole
 * SPA down with a blank page. The entry point checks `configError` and renders
 * a readable screen instead.
 */
export interface AppConfig {
  readonly apiBaseUrl: string;
}

export const appConfig: AppConfig = {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? '',
};

export const configError: string | null = appConfig.apiBaseUrl
  ? null
  : 'VITE_API_URL is not set — copy .env.example to .env.local and set it.';
