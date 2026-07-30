import { DataSource } from 'typeorm';

import { loadMigrationDatabaseConfig } from '../config/app.config';
import { buildMigrationDataSourceOptions } from './typeorm.config';

const SOURCE_MIGRATIONS_GLOB = 'src/migrations/*.ts';

/**
 * Host-side development convenience only — lets a developer run a migration
 * straight from TypeScript source without a build step first. Requires
 * `ts-node`, which stays a devDependency; the production image never loads
 * this file (its `npm run migration:run` points at the compiled entry
 * point instead). Loads the same migration-scoped config as the compiled
 * entry point — `DB_URL` only.
 */
export default new DataSource(
  buildMigrationDataSourceOptions(loadMigrationDatabaseConfig(), SOURCE_MIGRATIONS_GLOB),
);
