import { DataSource } from 'typeorm';

import { loadMigrationDatabaseConfig } from '../config/app.config';
import { buildMigrationDataSourceOptions } from './typeorm.config';

const SOURCE_MIGRATIONS_GLOB = 'src/migrations/*.ts';

/**
 * Host-side development convenience only — lets a developer run a migration
 * straight from TypeScript source without a build step first. Requires
 * `ts-node`, which stays a devDependency; `tsconfig.build.json` excludes
 * `*.dev.ts` so this never reaches the production image, which runs
 * `npm run migration:run` against the compiled entry point instead. Loads
 * the same migration-scoped config as that entry point.
 */
export default new DataSource(
  buildMigrationDataSourceOptions(loadMigrationDatabaseConfig(), SOURCE_MIGRATIONS_GLOB),
);
