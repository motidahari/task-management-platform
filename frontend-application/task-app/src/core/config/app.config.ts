/**
 * Single-parse-point for environment-derived configuration: every other
 * module reads {@link appConfig} instead of touching `import.meta.env`
 * directly, so swapping the backend host/port stays a one-variable change.
 */
export interface AppConfig {
  readonly apiBaseUrl: string;
}

function readApiBaseUrl(): string {
  const apiBaseUrl = import.meta.env.VITE_API_URL;

  if (!apiBaseUrl) {
    throw new Error('VITE_API_URL is not set — copy .env.example to .env.local and set it.');
  }

  return apiBaseUrl;
}

export const appConfig: AppConfig = {
  apiBaseUrl: readApiBaseUrl(),
};
