import type {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Translation boundary between persistence and the domain: entities never cross
 * it, so services only ever exchange domain models.
 *
 * Reads and writes go through separate accessors from day one. Both resolve to
 * the same database by default; routing reads to a replica later is a wiring
 * change in one place, not a change in any DAO method.
 */
export abstract class BaseDao<TEntity extends ObjectLiteral, TDomain> {
  protected constructor(
    private readonly entity: EntityTarget<TEntity>,
    private readonly writeDataSource: DataSource,
    private readonly readDataSource: DataSource,
  ) {}

  protected abstract toDomainModel(entity: TEntity): TDomain;

  protected abstract toEntity(domainModel: TDomain): DeepPartial<TEntity>;

  /** Transactions, locking reads and every mutation — anything that must see committed primary state. */
  protected get writeRepository(): Repository<TEntity> {
    return this.writeDataSource.getRepository(this.entity);
  }

  /** Queries where replica lag is acceptable. */
  protected get readRepository(): Repository<TEntity> {
    return this.readDataSource.getRepository(this.entity);
  }

  /** Repository bound to an ongoing transaction, so the statement joins it instead of opening its own. */
  protected repositoryFor(manager: EntityManager): Repository<TEntity> {
    return manager.getRepository(this.entity);
  }

  protected toDomainModels(entities: readonly TEntity[]): TDomain[] {
    return entities.map((entity) => this.toDomainModel(entity));
  }
}
