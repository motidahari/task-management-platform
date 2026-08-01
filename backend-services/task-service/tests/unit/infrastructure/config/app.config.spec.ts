import {
  loadAppConfig,
  loadMigrationDatabaseConfig,
} from '../../../../src/infrastructure/config/app.config';

describe('app.config', () => {
  const VALID_ENV: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    DB_URL: 'postgres://user:pass@localhost:5432/taskdb',
    DB_READ_URL: '',
    DB_POOL_SIZE: '10',
    DB_STATEMENT_TIMEOUT_MS: '5000',
    DB_LOCK_TIMEOUT_MS: '2000',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: 'http://localhost:5173',
    THROTTLE_TTL_SEC: '60',
    THROTTLE_LIMIT: '100',
  };

  function envWith(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
    return { ...VALID_ENV, ...overrides };
  }

  function envWithout(key: keyof typeof VALID_ENV): NodeJS.ProcessEnv {
    const env = { ...VALID_ENV };

    delete env[key];

    return env;
  }

  function captureError(fn: () => unknown): Error {
    try {
      fn();
    } catch (error) {
      return error as Error;
    }

    throw new Error('expected fn to throw');
  }

  describe('loadAppConfig', () => {
    describe('Given:a fully valid environment, When:loading it', () => {
      it('should return a typed config with every field parsed', () => {
        const config = loadAppConfig(VALID_ENV);

        expect(config).toEqual({
          nodeEnv: 'development',
          isProduction: false,
          port: 3000,
          database: {
            writeUrl: 'postgres://user:pass@localhost:5432/taskdb',
            readUrl: 'postgres://user:pass@localhost:5432/taskdb',
            poolSize: 10,
            statementTimeoutMs: 5000,
            lockTimeoutMs: 2000,
          },
          redisUrl: 'redis://localhost:6379',
          corsOrigins: ['http://localhost:5173'],
          throttle: { ttlSec: 60, limit: 100 },
          realtime: { maxConnections: 1000 },
        });
      });

      it('should mark production only when NODE_ENV is production', () => {
        expect(loadAppConfig(envWith({ NODE_ENV: 'production' })).isProduction).toBe(true);
      });

      it('should split a multi-origin CORS_ORIGINS list and trim each entry', () => {
        const config = loadAppConfig(envWith({ CORS_ORIGINS: ' http://a.com , http://b.com ' }));

        expect(config.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
      });
    });

    describe('Given:DB_READ_URL is set, When:loading the environment', () => {
      it('should route reads to the replica URL instead of DB_URL', () => {
        const config = loadAppConfig(
          envWith({ DB_READ_URL: 'postgres://user:pass@replica:5432/taskdb' }),
        );

        expect(config.database.readUrl).toBe('postgres://user:pass@replica:5432/taskdb');
        expect(config.database.writeUrl).toBe('postgres://user:pass@localhost:5432/taskdb');
      });
    });

    describe('Given:DB_READ_URL is empty, When:loading the environment', () => {
      it('should fall back reads to DB_URL', () => {
        const config = loadAppConfig(envWith({ DB_READ_URL: '' }));

        expect(config.database.readUrl).toBe(config.database.writeUrl);
      });
    });

    describe('Given:DB_URL is missing, When:loading the environment', () => {
      it('should fail fast with a readable message', () => {
        expect(() => loadAppConfig(envWithout('DB_URL'))).toThrow(/DB_URL/);
      });
    });

    describe('Given:DB_URL is not a parseable URL, When:loading the environment', () => {
      it('should fail fast naming DB_URL', () => {
        expect(() => loadAppConfig(envWith({ DB_URL: 'not a valid url' }))).toThrow(/DB_URL/);
      });

      it('should not leak the value into the error message', () => {
        const secret = 'p@ssw0rd-should-not-leak';
        const error = captureError(() =>
          loadAppConfig(envWith({ DB_URL: `not a valid url ${secret}` })),
        );

        expect(error.message).not.toContain(secret);
      });
    });

    describe('Given:DB_URL carries a username but no password, When:loading the environment', () => {
      it('should fail fast naming DB_URL and the missing half', () => {
        const error = captureError(() =>
          loadAppConfig(envWith({ DB_URL: 'postgres://taskapp@localhost:5432/taskdb' })),
        );

        expect(error.message).toMatch(/DB_URL/);
        expect(error.message).toMatch(/no password/);
      });
    });

    describe('Given:DB_URL carries a password but no username, When:loading the environment', () => {
      it('should fail fast naming DB_URL and the missing half', () => {
        const error = captureError(() =>
          loadAppConfig(envWith({ DB_URL: 'postgres://:change-me@localhost:5432/taskdb' })),
        );

        expect(error.message).toMatch(/DB_URL/);
        expect(error.message).toMatch(/no username/);
      });
    });

    describe('Given:POSTGRES_PASSWORD needs percent-encoding, When:loading the environment', () => {
      it('should compose a URL whose password round-trips back to the original', () => {
        const rawPassword = 'p@ss:word/with#special?chars here';

        const config = loadAppConfig(
          envWith({
            DB_URL: 'postgres://localhost:5432/taskdb',
            POSTGRES_USER: 'taskapp',
            POSTGRES_PASSWORD: rawPassword,
          }),
        );

        const roundTripped = new URL(config.database.writeUrl);

        expect(decodeURIComponent(roundTripped.password)).toBe(rawPassword);
      });
    });

    describe('Given:DB_URL carries query parameters, When:loading the environment', () => {
      it('should preserve them in the composed URL', () => {
        const config = loadAppConfig(
          envWith({
            DB_URL: 'postgres://localhost:5432/taskdb?sslmode=require',
            POSTGRES_USER: 'taskapp',
            POSTGRES_PASSWORD: 'change-me',
          }),
        );

        expect(new URL(config.database.writeUrl).searchParams.get('sslmode')).toBe('require');
      });
    });

    describe('Given:DB_URL has no inline credentials, When:loading the environment', () => {
      it('should compose the connection from POSTGRES_USER and POSTGRES_PASSWORD', () => {
        const config = loadAppConfig(
          envWith({
            DB_URL: 'postgres://localhost:5432/taskdb',
            POSTGRES_USER: 'taskapp',
            POSTGRES_PASSWORD: 'change-me',
          }),
        );

        expect(config.database.writeUrl).toBe('postgres://taskapp:change-me@localhost:5432/taskdb');
      });

      it('should compose DB_READ_URL the same way', () => {
        const config = loadAppConfig(
          envWith({
            DB_READ_URL: 'postgres://replica:5432/taskdb',
            POSTGRES_USER: 'taskapp',
            POSTGRES_PASSWORD: 'change-me',
          }),
        );

        expect(config.database.readUrl).toBe('postgres://taskapp:change-me@replica:5432/taskdb');
      });

      it('should fail fast when POSTGRES_PASSWORD is not set', () => {
        expect(() =>
          loadAppConfig(
            envWith({ DB_URL: 'postgres://localhost:5432/taskdb', POSTGRES_USER: 'taskapp' }),
          ),
        ).toThrow(/POSTGRES_USER \/ POSTGRES_PASSWORD/);
      });
    });

    describe('Given:DB_URL already carries credentials, When:loading the environment', () => {
      it('should leave the URL untouched even when POSTGRES_USER/PASSWORD are also set', () => {
        const config = loadAppConfig(
          envWith({
            DB_URL: 'postgres://user:pass@localhost:5432/taskdb',
            POSTGRES_USER: 'other',
            POSTGRES_PASSWORD: 'other-pass',
          }),
        );

        expect(config.database.writeUrl).toBe('postgres://user:pass@localhost:5432/taskdb');
      });
    });

    describe('Given:CORS_ORIGINS is empty, When:loading the environment', () => {
      it('should reject it', () => {
        expect(() => loadAppConfig(envWith({ CORS_ORIGINS: '' }))).toThrow(/CORS_ORIGINS/);
      });
    });

    describe('Given:CORS_ORIGINS is the wildcard, When:loading the environment', () => {
      it('should reject a bare wildcard', () => {
        expect(() => loadAppConfig(envWith({ CORS_ORIGINS: '*' }))).toThrow(/wildcard/);
      });

      it('should reject a wildcard mixed with real origins', () => {
        expect(() => loadAppConfig(envWith({ CORS_ORIGINS: 'http://a.com,*' }))).toThrow(
          /wildcard/,
        );
      });
    });

    describe('Given:a numeric env var holds non-numeric text, When:loading the environment', () => {
      it('should reject DB_POOL_SIZE', () => {
        expect(() => loadAppConfig(envWith({ DB_POOL_SIZE: 'abc' }))).toThrow();
      });

      it('should reject PORT', () => {
        expect(() => loadAppConfig(envWith({ PORT: 'not-a-number' }))).toThrow();
      });

      it('should reject THROTTLE_LIMIT', () => {
        expect(() => loadAppConfig(envWith({ THROTTLE_LIMIT: 'lots' }))).toThrow();
      });
    });

    describe('Given:REDIS_URL is missing, When:loading the environment', () => {
      it('should fail fast with a readable message', () => {
        expect(() => loadAppConfig(envWithout('REDIS_URL'))).toThrow(/REDIS_URL/);
      });
    });

    describe('Given:REALTIME_MAX_CONNECTIONS is unset, When:loading the environment', () => {
      it('should default the realtime connection cap to 1000', () => {
        expect(loadAppConfig(VALID_ENV).realtime).toEqual({ maxConnections: 1000 });
      });
    });

    describe('Given:REALTIME_MAX_CONNECTIONS is set, When:loading the environment', () => {
      it('should use the configured cap', () => {
        const config = loadAppConfig(envWith({ REALTIME_MAX_CONNECTIONS: '50' }));

        expect(config.realtime).toEqual({ maxConnections: 50 });
      });

      it('should reject a non-numeric value', () => {
        expect(() => loadAppConfig(envWith({ REALTIME_MAX_CONNECTIONS: 'lots' }))).toThrow();
      });
    });
  });

  describe('loadMigrationDatabaseConfig', () => {
    describe('Given:only DB_URL is present, When:loading the migration environment', () => {
      it('should succeed with no REDIS_URL or CORS_ORIGINS in the environment', () => {
        const migrationOnlyEnv = { DB_URL: VALID_ENV.DB_URL };

        expect(loadMigrationDatabaseConfig(migrationOnlyEnv)).toEqual({
          writeUrl: VALID_ENV.DB_URL,
        });
      });
    });

    describe('Given:DB_URL is missing, When:loading the migration environment', () => {
      it('should fail fast with a readable message', () => {
        expect(() => loadMigrationDatabaseConfig({})).toThrow(/DB_URL/);
      });
    });

    describe('Given:DB_URL is not a parseable URL, When:loading the migration environment', () => {
      it('should fail fast naming DB_URL', () => {
        expect(() => loadMigrationDatabaseConfig({ DB_URL: 'not a valid url' })).toThrow(/DB_URL/);
      });

      it('should not leak the value into the error message', () => {
        const secret = 'p@ssw0rd-should-not-leak';
        const error = captureError(() =>
          loadMigrationDatabaseConfig({ DB_URL: `not a valid url ${secret}` }),
        );

        expect(error.message).not.toContain(secret);
      });
    });

    describe('Given:DB_URL carries a username but no password, When:loading the migration environment', () => {
      it('should fail fast naming DB_URL and the missing half', () => {
        const error = captureError(() =>
          loadMigrationDatabaseConfig({ DB_URL: 'postgres://taskapp@localhost:5432/taskdb' }),
        );

        expect(error.message).toMatch(/DB_URL/);
        expect(error.message).toMatch(/no password/);
      });
    });

    describe('Given:DB_URL carries a password but no username, When:loading the migration environment', () => {
      it('should fail fast naming DB_URL and the missing half', () => {
        const error = captureError(() =>
          loadMigrationDatabaseConfig({ DB_URL: 'postgres://:change-me@localhost:5432/taskdb' }),
        );

        expect(error.message).toMatch(/DB_URL/);
        expect(error.message).toMatch(/no username/);
      });
    });

    describe('Given:POSTGRES_PASSWORD needs percent-encoding, When:loading the migration environment', () => {
      it('should compose a URL whose password round-trips back to the original', () => {
        const rawPassword = 'p@ss:word/with#special?chars here';

        const config = loadMigrationDatabaseConfig({
          DB_URL: 'postgres://localhost:5432/taskdb',
          POSTGRES_USER: 'taskapp',
          POSTGRES_PASSWORD: rawPassword,
        });

        const roundTripped = new URL(config.writeUrl);

        expect(decodeURIComponent(roundTripped.password)).toBe(rawPassword);
      });
    });

    describe('Given:DB_URL carries query parameters, When:loading the migration environment', () => {
      it('should preserve them in the composed URL', () => {
        const config = loadMigrationDatabaseConfig({
          DB_URL: 'postgres://localhost:5432/taskdb?sslmode=require',
          POSTGRES_USER: 'taskapp',
          POSTGRES_PASSWORD: 'change-me',
        });

        expect(new URL(config.writeUrl).searchParams.get('sslmode')).toBe('require');
      });
    });

    describe('Given:DB_URL has no inline credentials, When:loading the migration environment', () => {
      it('should compose the connection from POSTGRES_USER and POSTGRES_PASSWORD', () => {
        const config = loadMigrationDatabaseConfig({
          DB_URL: 'postgres://localhost:5432/taskdb',
          POSTGRES_USER: 'taskapp',
          POSTGRES_PASSWORD: 'change-me',
        });

        expect(config).toEqual({ writeUrl: 'postgres://taskapp:change-me@localhost:5432/taskdb' });
      });

      it('should fail fast when POSTGRES_PASSWORD is not set', () => {
        expect(() =>
          loadMigrationDatabaseConfig({
            DB_URL: 'postgres://localhost:5432/taskdb',
            POSTGRES_USER: 'taskapp',
          }),
        ).toThrow(/POSTGRES_USER \/ POSTGRES_PASSWORD/);
      });
    });
  });
});
