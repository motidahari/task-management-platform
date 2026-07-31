import type {
  DataSource,
  DeepPartial,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import {
  type CursorPage,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetCursor,
} from './keyset-cursor';

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

  /**
   * Inserts one row and maps it back to the domain model in a single step —
   * the save-then-map round trip every write DAO otherwise repeats. Always
   * bound to the caller's transaction `manager`, never opened as a fresh
   * connection, so the insert commits (or rolls back) with whatever else
   * that transaction does.
   */
  protected async insertOne(
    partial: DeepPartial<TEntity>,
    manager: EntityManager,
  ): Promise<TDomain> {
    const repository = this.repositoryFor(manager);
    const entity = await repository.save(repository.create(partial));

    return this.toDomainModel(entity);
  }

  /**
   * One keyset-paginated page over a `(createdAt, id)` ordering, mapped to the
   * domain model. The ordering columns, the over-fetch-by-one that detects a
   * next page, and the cursor round-trip are identical across every listing —
   * only the alias, sort direction and row filter differ, so those are the
   * only knobs a caller supplies.
   *
   * `direction` fixes the comparison too: a `DESC` page walks strictly
   * *before* the cursor (`<`), an `ASC` page strictly *after* it (`>`). `id`
   * is the tie-breaker on rows sharing one `createdAt`, so a page boundary
   * landing between two same-millisecond rows neither skips nor repeats one.
   *
   * Reads run on the replica-capable connection — keyset listings tolerate lag.
   */
  protected async findKeysetPage(params: {
    alias: string;
    direction: 'ASC' | 'DESC';
    limit: number;
    cursor: string | undefined;
    applyFilter: (queryBuilder: SelectQueryBuilder<TEntity>) => void;
    keyOf: (entity: TEntity) => KeysetCursor;
  }): Promise<CursorPage<TDomain>> {
    const { alias, direction, limit, cursor, applyFilter, keyOf } = params;
    const afterCursor = cursor === undefined ? null : decodeKeysetCursor(cursor);
    const comparator = direction === 'DESC' ? '<' : '>';

    const queryBuilder = this.readRepository
      .createQueryBuilder(alias)
      .orderBy(`${alias}.createdAt`, direction)
      .addOrderBy(`${alias}.id`, direction)
      .take(limit + 1);

    applyFilter(queryBuilder);

    if (afterCursor) {
      queryBuilder.andWhere(
        `(${alias}.createdAt, ${alias}.id) ${comparator} (:cursorCreatedAt, :cursorId)`,
        { cursorCreatedAt: afterCursor.createdAt, cursorId: afterCursor.id },
      );
    }

    const rows = await queryBuilder.getMany();
    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      items: this.toDomainModels(pageRows),
      nextCursor: hasNextPage && lastRow ? encodeKeysetCursor(keyOf(lastRow)) : null,
    };
  }
}
