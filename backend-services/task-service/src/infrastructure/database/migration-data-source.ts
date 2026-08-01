import { DataSource } from 'typeorm';

import { loadMigrationDatabaseConfig } from '../config/app.config';
import { buildMigrationDataSourceOptions } from './typeorm.config';

/**
 * Entry point for the TypeORM CLI's `-d` flag, and only that. Nothing else in
 * this service imports this file, so building a real `DataSource` and
 * reading the environment as a side effect of import stays confined to the
 * one process that runs it — the one-shot migration job — instead of
 * happening every time the app or a test imports the builder functions.
 *
 * Loads only the migration-scoped config (`DB_URL`, composed with
 * `POSTGRES_USER` / `POSTGRES_PASSWORD` when it carries no credentials of its
 * own), not the full app config — this process must not fail on a variable it
 * has no use for.
 *
 * Points at the compiled `dist/migrations` output because that is what the
 * production image actually ships; run against `npm run build`'s output.
 */
export default new DataSource(buildMigrationDataSourceOptions(loadMigrationDatabaseConfig()));
