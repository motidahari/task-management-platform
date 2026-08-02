import { utcTimestampTextExpression } from '@core/shared';
import { Column, CreateDateColumn, Entity, PrimaryColumn, VirtualColumn } from 'typeorm';

/**
 * Persistence mapping only — ORM metadata behind the DAO boundary. Never
 * imported by a service; services exchange domain models, not this type.
 *
 * `id` defaults via the database's built-in `gen_random_uuid()` rather than
 * `@PrimaryGeneratedColumn('uuid')`, which relies on the `uuid-ossp`
 * extension: an explicit default keeps the id generator extension-free.
 */
@Entity('users')
export class UserEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  /**
   * `created_at` projected as UTC text at full stored precision, computed on
   * every read rather than persisted — the pg driver parses `timestamptz` to
   * a millisecond-precision `Date` before TypeORM ever sees the row, so the
   * only way to recover the microseconds Postgres actually stored, which the
   * keyset cursor must carry to not drop rows sharing one boundary instant,
   * is to read them back out as text.
   */
  @VirtualColumn({
    type: 'text',
    query: (alias) => utcTimestampTextExpression(`${alias}.created_at`),
  })
  createdAtRaw!: string;
}
