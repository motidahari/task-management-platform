import type { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

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

  findById(
    id: string,
    onMissing: () => never,
    options?: { manager?: EntityManager; lock?: { mode: 'pessimistic_write' } },
  ): Promise<User> {
    return this.findOneOrThrow({ id }, onMissing, options);
  }

  updateById(
    id: string,
    set: QueryDeepPartialEntity<UserRow>,
    mapRawRow: (rawRow: unknown) => UserRow,
    onMissing: () => never,
    manager: EntityManager,
  ): Promise<User> {
    return this.updateByIdReturning(id, set, mapRawRow, onMissing, manager);
  }
}

describe('BaseDao', () => {
  const writeRepository = { name: 'write-repository' };
  const readRepository: { name: string; findOne: jest.Mock } = {
    name: 'read-repository',
    findOne: jest.fn(),
  };

  let create: jest.Mock;
  let save: jest.Mock;
  let findOne: jest.Mock;
  let execute: jest.Mock;
  let queryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock;
  };
  let createQueryBuilder: jest.Mock;
  let transactionRepository: {
    name: string;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let getWriteRepository: jest.Mock;
  let getReadRepository: jest.Mock;
  let getTransactionRepository: jest.Mock;
  let transactionManager: EntityManager;
  let dao: UserDao;

  beforeEach(() => {
    create = jest.fn((partial: DeepPartial<UserRow>) => partial);
    save = jest.fn((entity: UserRow) => Promise.resolve(entity));
    findOne = jest.fn();
    readRepository.findOne = jest.fn();
    execute = jest.fn();
    queryBuilder = {
      update: jest.fn(() => queryBuilder),
      set: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      returning: jest.fn(() => queryBuilder),
      execute,
    };
    createQueryBuilder = jest.fn(() => queryBuilder);
    transactionRepository = {
      name: 'transaction-repository',
      create,
      save,
      findOne,
      createQueryBuilder,
    };
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

  describe('Given:a lag-tolerant existence read, When:the row is found', () => {
    const throwOnMissing = (): never => {
      throw new Error('should not be called');
    };

    it('should read from the replica-capable repository and map the row', async () => {
      readRepository.findOne.mockResolvedValue({ id: 'u-1', name: 'Alice' });

      const model = await dao.findById('u-1', throwOnMissing);

      expect(readRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        lock: undefined,
      });
      expect(getTransactionRepository).not.toHaveBeenCalled();
      expect(model).toEqual(new User('u-1', 'Alice'));
    });
  });

  describe('Given:a locking existence read inside a transaction, When:the row is found', () => {
    const throwOnMissing = (): never => {
      throw new Error('should not be called');
    };

    it('should read through the transaction repository with the requested lock', async () => {
      findOne.mockResolvedValue({ id: 'u-1', name: 'Alice' });

      const model = await dao.findById('u-1', throwOnMissing, {
        manager: transactionManager,
        lock: { mode: 'pessimistic_write' },
      });

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(readRepository.findOne).not.toHaveBeenCalled();
      expect(model).toEqual(new User('u-1', 'Alice'));
    });
  });

  describe('Given:an existence read, When:no row matches', () => {
    it('should throw the caller-supplied not-found rather than return null', async () => {
      readRepository.findOne.mockResolvedValue(null);

      await expect(
        dao.findById('missing', () => {
          throw new Error('not found');
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('Given:an update by id returning the row, When:the update matches a row', () => {
    const throwOnMissing = (): never => {
      throw new Error('should not be called');
    };

    it('should update, return the row and map the raw result to its domain model', async () => {
      execute.mockResolvedValue({ raw: [{ id: 'u-1', name: 'Renamed' }] });

      const model = await dao.updateById(
        'u-1',
        { name: 'Renamed' },
        (rawRow) => rawRow as UserRow,
        throwOnMissing,
        transactionManager,
      );

      expect(createQueryBuilder).toHaveBeenCalled();
      expect(queryBuilder.set).toHaveBeenCalledWith({ name: 'Renamed' });
      expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 'u-1' });
      expect(queryBuilder.returning).toHaveBeenCalledWith('*');
      expect(getWriteRepository).not.toHaveBeenCalled();
      expect(model).toEqual(new User('u-1', 'Renamed'));
    });
  });

  describe('Given:an update by id returning the row, When:the update matches no row', () => {
    it('should throw the caller-supplied not-found rather than map undefined', async () => {
      execute.mockResolvedValue({ raw: [] });

      await expect(
        dao.updateById(
          'missing',
          { name: 'Renamed' },
          (rawRow) => rawRow as UserRow,
          () => {
            throw new Error('no row');
          },
          transactionManager,
        ),
      ).rejects.toThrow('no row');
    });
  });
});
