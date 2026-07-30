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

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_URL: dbUrlField,
  DB_READ_URL: z.string().default(''),
  DB_POOL_SIZE: z.coerce.number().int().positive().default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(2000),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  CORS_ORIGINS: corsOriginList,
  THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

/**
 * The one-shot migration job runs as its own process, wired only with
 * `DB_URL` (see `docker-compose.yml`'s `migrate` service) — it has no use for
 * Redis or a CORS allowlist, and the migration DataSource itself ignores the
 * runtime pool size and timeouts. Requiring the full app schema here would
 * make an unrelated env var's absence break schema migrations.
 */
const MigrationEnvSchema = z.object({
  DB_URL: dbUrlField,
});

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

  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    port: parsed.PORT,
    database: {
      writeUrl: parsed.DB_URL,
      readUrl: parsed.DB_READ_URL.length > 0 ? parsed.DB_READ_URL : parsed.DB_URL,
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
  };
}

/** What the migration DataSource actually reads — see `buildMigrationDataSourceOptions`. */
export interface MigrationDatabaseConfig {
  readonly writeUrl: string;
}

/**
 * Parses and validates only what the one-shot migration job needs. Kept
 * separate from {@link loadAppConfig} on purpose: the migration job's own
 * process is wired with `DB_URL` alone, so requiring the rest of the app's
 * env (Redis, CORS) here would make the migration fail on a variable it
 * never uses.
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

  return { writeUrl: result.data.DB_URL };
}

interface ReadableIssue {
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

function describeIssues(issues: readonly ReadableIssue[]): string {
  return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
