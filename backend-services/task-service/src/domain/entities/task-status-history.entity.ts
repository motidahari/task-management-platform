import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Persistence mapping only — ORM metadata behind the DAO boundary. Never
 * imported by a service; services exchange domain models, not this type.
 *
 * Composite primary key `(id, createdAt)`: the table is partitioned by
 * range on `created_at`, and Postgres requires the partition key inside the
 * primary key, even though `id` alone is already globally unique.
 *
 * `taskId` and `assignedUserId` are plain FK columns, not `@ManyToOne`
 * relations — this service keeps entities flat and reads related rows
 * explicitly through the DAO layer. Referential integrity (FKs to `tasks`
 * and `users`, the cascade delete from `tasks`, and the check that
 * `fromStatus`/`toStatus` are not both null) are DB constraints owned by
 * the migration, not expressible as plain column metadata here.
 *
 * `id` defaults via the database's built-in `gen_random_uuid()` rather than
 * `@PrimaryGeneratedColumn('uuid')`, which relies on the `uuid-ossp`
 * extension: an explicit default keeps the id generator extension-free.
 */
@Entity('task_status_history')
export class TaskStatusHistoryEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'uuid', name: 'task_id' })
  taskId!: string;

  @Column({ type: 'int', name: 'from_status', nullable: true })
  fromStatus!: number | null;

  @Column({ type: 'int', name: 'to_status', nullable: true })
  toStatus!: number | null;

  @Column({ type: 'uuid', name: 'assigned_user_id' })
  assignedUserId!: string;

  @Column({ type: 'jsonb', name: 'fields_snapshot', default: {} })
  fieldsSnapshot!: Record<string, unknown>;

  @PrimaryColumn({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;
}
