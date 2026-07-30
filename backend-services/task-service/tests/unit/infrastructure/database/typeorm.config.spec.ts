import type {
  DatabaseConfig,
  MigrationDatabaseConfig,
} from '../../../../src/infrastructure/config/app.config';
import {
  buildMigrationDataSourceOptions,
  buildReadDataSourceOptions,
  buildWriteDataSourceOptions,
} from '../../../../src/infrastructure/database/typeorm.config';

const DATABASE: DatabaseConfig = {
  writeUrl: 'postgres://user:pass@primary:5432/taskdb',
  readUrl: 'postgres://user:pass@primary:5432/taskdb',
  poolSize: 10,
  statementTimeoutMs: 5000,
  lockTimeoutMs: 2000,
};

const REPLICA_DATABASE: DatabaseConfig = {
  ...DATABASE,
  readUrl: 'postgres://user:pass@replica:5432/taskdb',
};

/** Deliberately just `writeUrl` — everything `buildMigrationDataSourceOptions` reads. */
const MIGRATION_DATABASE: MigrationDatabaseConfig = {
  writeUrl: 'postgres://user:pass@primary:5432/taskdb',
};

describe('buildWriteDataSourceOptions', () => {
  describe('Given:the resolved database config, When:building the write DataSource options', () => {
    it('should never synchronize or auto-run migrations at boot', () => {
      const options = buildWriteDataSourceOptions(DATABASE);

      expect(options.synchronize).toBe(false);
      expect(options.migrationsRun).toBe(false);
    });

    it('should point at the write URL', () => {
      expect(buildWriteDataSourceOptions(DATABASE).url).toBe(DATABASE.writeUrl);
    });

    it('should carry the pool size and per-connection timeouts from config', () => {
      const options = buildWriteDataSourceOptions(DATABASE);

      expect(options.poolSize).toBe(10);
      expect(options.extra).toEqual({ statement_timeout: 5000, lock_timeout: 2000 });
    });
  });
});

describe('buildReadDataSourceOptions', () => {
  describe('Given:DB_READ_URL was not set, When:building the read DataSource options', () => {
    it('should resolve to the same URL as the write DataSource', () => {
      const options = buildReadDataSourceOptions(DATABASE);

      expect(options.url).toBe(DATABASE.writeUrl);
    });
  });

  describe('Given:DB_READ_URL was set, When:building the read DataSource options', () => {
    it('should route to the replica URL', () => {
      const options = buildReadDataSourceOptions(REPLICA_DATABASE);

      expect(options.url).toBe('postgres://user:pass@replica:5432/taskdb');
    });
  });

  describe('Given:any read DataSource, When:built', () => {
    it('should never synchronize or auto-run migrations at boot', () => {
      const options = buildReadDataSourceOptions(DATABASE);

      expect(options.synchronize).toBe(false);
      expect(options.migrationsRun).toBe(false);
    });

    it('should carry the same pool size and timeouts as the write DataSource', () => {
      const options = buildReadDataSourceOptions(DATABASE);

      expect(options.poolSize).toBe(10);
      expect(options.extra).toEqual({ statement_timeout: 5000, lock_timeout: 2000 });
    });
  });
});

describe('buildMigrationDataSourceOptions', () => {
  describe('Given:the one-shot migration job, When:building its DataSource options', () => {
    it('should exempt statement_timeout from the runtime 5s default', () => {
      const options = buildMigrationDataSourceOptions(MIGRATION_DATABASE);

      expect(options.extra).toEqual({ statement_timeout: 0 });
    });

    it('should target the write URL', () => {
      expect(buildMigrationDataSourceOptions(MIGRATION_DATABASE).url).toBe(
        MIGRATION_DATABASE.writeUrl,
      );
    });

    it('should point migrations at the compiled dist output by default', () => {
      const options = buildMigrationDataSourceOptions(MIGRATION_DATABASE);

      expect(options.migrations).toEqual(['dist/migrations/*.js']);
    });

    it('should accept an override glob for a host-side development entry point', () => {
      const options = buildMigrationDataSourceOptions(MIGRATION_DATABASE, 'src/migrations/*.ts');

      expect(options.migrations).toEqual(['src/migrations/*.ts']);
    });

    it('should still refuse to synchronize or auto-run migrations at boot', () => {
      const options = buildMigrationDataSourceOptions(MIGRATION_DATABASE);

      expect(options.synchronize).toBe(false);
      expect(options.migrationsRun).toBe(false);
    });
  });
});
