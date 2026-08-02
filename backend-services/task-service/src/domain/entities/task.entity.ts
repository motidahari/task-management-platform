import { utcTimestampTextExpression } from '@core/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VirtualColumn,
} from 'typeorm';

/**
 * Persistence mapping only — ORM metadata behind the DAO boundary. Never
 * imported by a service; services exchange domain models, not this type.
 *
 * `assignedUserId` is a plain FK column, not a `@ManyToOne` relation: this
 * service keeps entities flat and reads the assignee explicitly through the
 * DAO layer rather than an eager relation fan-out. Referential integrity
 * (the FK to `users`) and the `status >= 1` check are DB constraints owned
 * by the migration, not expressible as plain column metadata here.
 *
 * `id` defaults via the database's built-in `gen_random_uuid()` rather than
 * `@PrimaryGeneratedColumn('uuid')`, which relies on the `uuid-ossp`
 * extension: an explicit default keeps the id generator extension-free.
 */
@Entity('tasks')
export class TaskEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'int', default: 1 })
  status!: number;

  @Column({ type: 'boolean', name: 'is_closed', default: false })
  isClosed!: boolean;

  @Column({ type: 'uuid', name: 'assigned_user_id' })
  assignedUserId!: string;

  @Column({ type: 'jsonb', name: 'custom_fields', default: {} })
  customFields!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;

  /**
   * `updated_at` projected as UTC text at full stored precision, computed on
   * every read rather than persisted — the pg driver parses `timestamptz` to
   * a millisecond-precision `Date` before TypeORM ever sees the row, so the
   * only way to recover the microseconds Postgres actually stored is to read
   * them back out as text.
   */
  @VirtualColumn({
    type: 'text',
    query: (alias) => utcTimestampTextExpression(`${alias}.updated_at`),
  })
  updatedAtRaw!: string;

  /**
   * `created_at`'s equivalent of `updatedAtRaw` — the keyset cursor encodes
   * this column too, and a `Date`-truncated boundary silently drops every
   * row that shares its cursor row's exact microsecond timestamp.
   */
  @VirtualColumn({
    type: 'text',
    query: (alias) => utcTimestampTextExpression(`${alias}.created_at`),
  })
  createdAtRaw!: string;
}
