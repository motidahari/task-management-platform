import { MigrationInterface, QueryRunner } from 'typeorm';

import { deleteDemoUsers, insertDemoUsers } from './support/demo-users';

/**
 * First seeds the demo user roster into a fresh database. Environments that
 * already applied this migration before the roster grew converge onto the
 * current list via `SyncDemoUsers1700000000003` instead — TypeORM never
 * re-runs a migration name it has already recorded, so this file only ever
 * seeds new databases from here on.
 */
export class SeedUsers1700000000002 implements MigrationInterface {
  name = 'SeedUsers1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await insertDemoUsers(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await deleteDemoUsers(queryRunner);
  }
}
