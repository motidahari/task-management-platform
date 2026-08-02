import { MigrationInterface, QueryRunner } from 'typeorm';

import { insertDemoUsers } from './support/demo-users';

/**
 * Re-runs the same idempotent, parameterized demo-user insert as
 * `SeedUsers1700000000002` over the current `DEMO_USERS` roster. TypeORM
 * records applied migrations by name and never re-executes one already
 * recorded, so an environment that ran the base seed before the roster grew
 * would otherwise stay stuck on the smaller list forever; this migration
 * converges it onto the full roster instead.
 *
 * `down` is a deliberate no-op: which of these rows an already-seeded
 * environment actually needed from this pass is environment-dependent, so
 * guessing would risk deleting rows the base migration owns. Reverting
 * `SeedUsers1700000000002` already removes every demo-user email, so
 * rolling back the whole chain still ends at zero demo users.
 */
export class SyncDemoUsers1700000000003 implements MigrationInterface {
  name = 'SyncDemoUsers1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await insertDemoUsers(queryRunner);
  }

  public down(): Promise<void> {
    return Promise.resolve();
  }
}
