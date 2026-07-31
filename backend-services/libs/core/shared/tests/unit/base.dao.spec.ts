import type { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';

import { BaseDao } from '../../src/dao/base.dao';

const TABLE = 'users';

interface UserRow {
  id: string;
  name: string;
}

class User {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {}
}

/**
 * A DAO is the only consumer of `BaseDao`, so the base class is exercised
 * through one — exposing the accessors it would otherwise use internally.
 */
class UserDao extends BaseDao<UserRow, User> {
  constructor(writeDataSource: DataSource, readDataSource: DataSource) {
    super(TABLE, writeDataSource, readDataSource);
  }

  protected toDomainModel(entity: UserRow): User {
    return new User(entity.id, entity.name);
  }

  protected toEntity(domainModel: User): DeepPartial<UserRow> {
    return { id: domainModel.id, name: domainModel.name };
  }

  mapMany(entities: readonly UserRow[]): User[] {
    return this.toDomainModels(entities);
  }

  forWriting(): Repository<UserRow> {
    return this.writeRepository;
  }

  forReading(): Repository<UserRow> {
    return this.readRepository;
  }

  inTransaction(manager: EntityManager): Repository<UserRow> {
    return this.repositoryFor(manager);
  }

  insert(partial: DeepPartial<UserRow>, manager: EntityManager): Promise<User> {
    return this.insertOne(partial, manager);
  }
}

describe('BaseDao', () => {
  const writeRepository = { name: 'write-repository' };
  const readRepository = { name: 'read-repository' };

  let create: jest.Mock;
  let save: jest.Mock;
  let transactionRepository: { name: string; create: jest.Mock; save: jest.Mock };
  let getWriteRepository: jest.Mock;
  let getReadRepository: jest.Mock;
  let getTransactionRepository: jest.Mock;
  let transactionManager: EntityManager;
  let dao: UserDao;

  beforeEach(() => {
    create = jest.fn((partial: DeepPartial<UserRow>) => partial);
    save = jest.fn((entity: UserRow) => Promise.resolve(entity));
    transactionRepository = { name: 'transaction-repository', create, save };
    getWriteRepository = jest.fn().mockReturnValue(writeRepository);
    getReadRepository = jest.fn().mockReturnValue(readRepository);
    getTransactionRepository = jest.fn().mockReturnValue(transactionRepository);
    transactionManager = { getRepository: getTransactionRepository } as unknown as EntityManager;
    dao = new UserDao(
      { getRepository: getWriteRepository } as unknown as DataSource,
      { getRepository: getReadRepository } as unknown as DataSource,
    );
  });

  describe('Given:entities loaded from the database, When:mapping them for a service', () => {
    it('should return one domain model per row, in order', () => {
      const models = dao.mapMany([
        { id: 'u-1', name: 'Alice' },
        { id: 'u-2', name: 'Bob' },
      ]);

      expect(models).toEqual([new User('u-1', 'Alice'), new User('u-2', 'Bob')]);
    });

    it('should return an empty list for no rows', () => {
      expect(dao.mapMany([])).toEqual([]);
    });
  });

  describe('Given:a mutation or locking read, When:resolving a repository', () => {
    it('should take it from the write data source', () => {
      expect(dao.forWriting()).toBe(writeRepository);
      expect(getWriteRepository).toHaveBeenCalledWith(TABLE);
    });

    it('should not touch the read data source', () => {
      dao.forWriting();

      expect(getReadRepository).not.toHaveBeenCalled();
    });
  });

  describe('Given:a lag-tolerant query, When:resolving a repository', () => {
    it('should take it from the read data source', () => {
      expect(dao.forReading()).toBe(readRepository);
      expect(getReadRepository).toHaveBeenCalledWith(TABLE);
    });

    it('should not touch the write data source', () => {
      dao.forReading();

      expect(getWriteRepository).not.toHaveBeenCalled();
    });
  });

  describe('Given:an ongoing transaction, When:resolving a repository', () => {
    it('should bind it to that transaction manager rather than opening its own', () => {
      expect(dao.inTransaction(transactionManager)).toBe(transactionRepository);
      expect(getTransactionRepository).toHaveBeenCalledWith(TABLE);
      expect(getWriteRepository).not.toHaveBeenCalled();
    });
  });

  describe('Given:a partial row to insert, When:inserting inside an ongoing transaction', () => {
    it('should create then save through the transaction-bound repository', async () => {
      await dao.insert({ id: 'u-1', name: 'Alice' }, transactionManager);

      expect(create).toHaveBeenCalledWith({ id: 'u-1', name: 'Alice' });
      expect(save).toHaveBeenCalledWith({ id: 'u-1', name: 'Alice' });
    });

    it('should return the saved row mapped to its domain model', async () => {
      const model = await dao.insert({ id: 'u-1', name: 'Alice' }, transactionManager);

      expect(model).toEqual(new User('u-1', 'Alice'));
    });

    it('should not open a fresh repository outside the given transaction', async () => {
      await dao.insert({ id: 'u-1', name: 'Alice' }, transactionManager);

      expect(getWriteRepository).not.toHaveBeenCalled();
      expect(getReadRepository).not.toHaveBeenCalled();
    });
  });
});
