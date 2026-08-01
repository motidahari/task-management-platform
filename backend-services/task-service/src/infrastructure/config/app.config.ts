import { z } from 'zod';

/** DI token — inject this, never call {@link loadAppConfig} again outside bootstrap. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly isProduction: boolean;
  readonly port: number;
  readonly database: DatabaseConfig;
  readonly redisUrl: string;
  readonly corsOrigins: readonly string[];
  readonly throttle: ThrottleConfig;
  readonly realtime: RealtimeConfig;
}

export interface DatabaseConfig {
  readonly writeUrl: string;
  /** Resolved read URL — already falls back to {@link writeUrl} when `DB_READ_URL` is unset. */
  readonly readUrl: string;
  readonly poolSize: number;
  readonly statementTimeoutMs: number;
  readonly lockTimeoutMs: number;
}

export interface ThrottleConfig {
  readonly ttlSec: number;
  readonly limit: number;
}

export interface RealtimeConfig {
  /** Hard cap on concurrently connected sockets on the realtime namespace, past which new connections are rejected. */
  readonly maxConnections: number;
}

const WILDCARD_ORIGIN = '*';

/**
 * `CORS_ORIGINS` is comma-separated and must never grant every origin — a
 * wildcard entry defeats the allowlist regardless of what else is listed
 * alongside it.
 */
const corsOriginList = z
  .string()
  .min(1, 'CORS_ORIGINS is required')
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .refine((origins) => origins.every((origin) => origin.length > 0), {
    error: 'CORS_ORIGINS must not contain empty entries',
  })
  .refine((origins) => !origins.includes(WILDCARD_ORIGIN), {
    error: 'CORS_ORIGINS must not include the wildcard "*"',
  });

/**
 * The one field the migration DataSource actually reads. Defined once and
 * reused by both schemas below so the app schema and the migration-only
 * schema can never validate `DB_URL` differently from each other.
 */
const dbUrlField = z.string().min(1, 'DB_URL is required');

/**
 * `DB_URL` / `DB_READ_URL` ship credential-free in `.env.example` — these
 * supply the user and password that {@link composeDatabaseUrl} injects at
 * read time. Optional here (default `''`) because a `DB_URL` that already
 * embeds a full secret URL, as real deployments pass, has no use for them.
 */
const postgresUserField = z.string().default('');
const postgresPasswordField = z.string().default('');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_URL: dbUrlField,
  DB_READ_URL: z.string().default(''),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(2000),
  POSTGRES_USER: postgresUserField,
  POSTGRES_PASSWORD: postgresPasswordField,
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CORS_ORIGINS: corsOriginList,
  THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
  REALTIME_MAX_CONNECTIONS: z.coerce.number().int().positive().default(1000),
});

/**
 * The one-shot migration job runs as its own process, wired only with
 * `DB_URL` (see `docker-compose.yml`'s `migrate` service) — it has no use for
 * Redis or a CORS allowlist, and the migration DataSource itself ignores the
 * runtime pool size and timeouts. Requiring the full app schema here would
 * make an unrelated env var's absence break schema migrations. Still parses
 * `POSTGRES_USER` / `POSTGRES_PASSWORD` so this schema composes a
 * credential-free `DB_URL` exactly like {@link EnvSchema} does.
 */
const MigrationEnvSchema = z.object({
  DB_URL: dbUrlField,
  POSTGRES_USER: postgresUserField,
  POSTGRES_PASSWORD: postgresPasswordField,
});

/**
 * A connection string may carry a password, so no failure message built from
 * one is safe to echo verbatim. This renders only the parts that never
 * carry a secret — scheme, host, port and database — for use in messages
 * that still need to point at *which* URL is the problem.
 */
function describeUrlSafely(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/**
 * Injects `user`/`password` into `rawUrl` only when `rawUrl` carries neither
 * of its own — a `DB_URL` that already embeds a full user:password pair (a
 * real deployment's secret URL) is returned untouched, so this only ever
 * adds credentials, never strips or overrides them. A URL that carries only
 * one half of the pair is a configuration mistake, not a "fill in the rest"
 * case, and fails fast instead of silently dropping it. The single place
 * either schema composes a connection string, so the full app config and the
 * migration-only config can never disagree on how `DB_URL` (or
 * `DB_READ_URL`) is built.
 *
 * Every failure names `varName` (`DB_URL` or `DB_READ_URL`) and, at most,
 * {@link describeUrlSafely}'s credential-free rendering of the value — never
 * the raw string, which may itself be the secret.
 */
function composeDatabaseUrl(
  varName: string,
  rawUrl: string,
  user: string,
  password: string,
): string {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${varName} is not a valid connection URL`);
  }

  const hasUsername = url.username.length > 0;
  const hasPassword = url.password.length > 0;

  if (hasUsername && hasPassword) {
    return rawUrl;
  }

  if (hasUsername !== hasPassword) {
    const present = hasUsername ? 'a username' : 'a password';
    const missing = hasUsername ? 'password' : 'username';

    throw new Error(
      `${varName} (${describeUrlSafely(url)}) has ${present} but no ${missing} — provide both or neither`,
    );
  }

  if (user.length === 0 || password.length === 0) {
    throw new Error(
      `${varName} (${describeUrlSafely(url)}) carries no credentials and POSTGRES_USER / POSTGRES_PASSWORD are not both set`,
    );
  }

  url.username = user;
  url.password = password;

  return url.toString();
}

/**
 * Parses and validates `process.env` once. Every other file reads the typed
 * `AppConfig` this returns — nothing else in this service touches `process.env`.
 * Invalid or missing values fail fast with a readable message instead of an
 * undefined creeping into a query or a CORS header at request time.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${describeIssues(result.error.issues)}`);
  }

  const parsed = result.data;
  const writeUrl = composeDatabaseUrl(
    'DB_URL',
    parsed.DB_URL,
    parsed.POSTGRES_USER,
    parsed.POSTGRES_PASSWORD,
  );
  const readUrl =
    parsed.DB_READ_URL.length > 0
      ? composeDatabaseUrl(
          'DB_READ_URL',
          parsed.DB_READ_URL,
          parsed.POSTGRES_USER,
          parsed.POSTGRES_PASSWORD,
        )
      : writeUrl;

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    port: parsed.PORT,
    database: {
      writeUrl,
      readUrl,
      poolSize: parsed.DB_POOL_SIZE,
      statementTimeoutMs: parsed.DB_STATEMENT_TIMEOUT_MS,
      lockTimeoutMs: parsed.DB_LOCK_TIMEOUT_MS,
    },
    redisUrl: parsed.REDIS_URL,
    corsOrigins: parsed.CORS_ORIGINS,
    throttle: {
      ttlSec: parsed.THROTTLE_TTL_SEC,
      limit: parsed.THROTTLE_LIMIT,
    },
    realtime: {
      maxConnections: parsed.REALTIME_MAX_CONNECTIONS,
    },
  };
}

/** What the migration DataSource actually reads — see `buildMigrationDataSourceOptions`. */
export interface MigrationDatabaseConfig {
  readonly writeUrl: string;
}

/**
 * Parses and validates only what the one-shot migration job needs. Kept
 * separate from {@link loadAppConfig} on purpose: the migration job's own
 * process is wired with `DB_URL` (plus `POSTGRES_USER` / `POSTGRES_PASSWORD`
 * to compose it) alone, so requiring the rest of the app's env (Redis, CORS)
 * here would make the migration fail on a variable it never uses.
 */
export function loadMigrationDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): MigrationDatabaseConfig {
  const result = MigrationEnvSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      `Invalid migration environment configuration: ${describeIssues(result.error.issues)}`,
    );
  }

  const parsed = result.data;

  return {
    writeUrl: composeDatabaseUrl(
      'DB_URL',
      parsed.DB_URL,
      parsed.POSTGRES_USER,
      parsed.POSTGRES_PASSWORD,
    ),
  };
}

interface ReadableIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

function describeIssues(issues: readonly ReadableIssue[]): string {
  return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
