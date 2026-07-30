import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

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
}
