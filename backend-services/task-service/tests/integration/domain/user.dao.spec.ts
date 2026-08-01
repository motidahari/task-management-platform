import { ValidationException } from '@core/shared';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UserDao } from '../../../src/domain/user.dao';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { buildTestUser } from '../support/test-data-builders';
import {
  isTestDatabaseConfigured,
  setupTestDatabase,
  TestDatabase,
} from '../support/test-database';

/**
 * Runs only against a real Postgres instance reachable at `DB_URL` — skipped
 * entirely, rather than failed, when no database is configured for the local
 * run, the same convention every other integration suite in this service uses.
 */
const describeAgainstRealDatabase = isTestDatabaseConfigured() ? describe : describe.skip;

interface InsertedUserRow {
  readonly id: string;
  readonly createdAt: Date;
}

/**
 * Inserts a user row with an exact, caller-chosen `created_at` — the one way
 * this suite controls the ordering key precisely instead of trusting
 * whatever the ORM does with a caller-supplied value on an auto-generated
 * column.
 */
async function insertUserAt(
  dataSource: DataSource,
  overrides: { name: string; email: string },
  createdAt: Date,
): Promise<InsertedUserRow> {
  const rows: Array<{ id: string; created_at: Date }> = await dataSource.query(
    `INSERT INTO users (name, email, created_at) VALUES ($1, $2, $3) RETURNING id, created_at`,
    [overrides.name, overrides.email, createdAt],
  );
  const [row] = rows;

  if (!row) {
    throw new Error('INSERT ... RETURNING produced no row');
  }

  return { id: row.id, createdAt: row.created_at };
}

describeAgainstRealDatabase('UserDao, Given:a reachable Postgres instance', () => {
  let testDatabase: TestDatabase;
  let userDao: UserDao;

  beforeAll(async () => {
    testDatabase = await setupTestDatabase();
    userDao = new UserDao(testDatabase.dataSource, testDatabase.dataSource);
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  afterAll(async () => {
    await testDatabase.teardown();
  });

  describe('Given:a user row exists, When:getById is called with its id', () => {
    it('should return the mapped User domain model', async () => {
      const userRepository = testDatabase.dataSource.getRepository(UserEntity);
      const savedUser = await userRepository.save(buildTestUser());

      const user = await userDao.getById(savedUser.id);

      expect(user.id).toBe(savedUser.id);
      expect(user.name).toBe(savedUser.name);
      expect(user.email).toBe(savedUser.email);
    });
  });

  describe('Given:no user with that id, When:getById is called', () => {
    it('should throw NotFoundException', async () => {
      await expect(userDao.getById('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Given:more inserted users than fit on one page, When:paginating with a small limit', () => {
    it('should walk every inserted row exactly once, newest-first, agreeing with a created_at/id DESC scan restricted to those rows', async () => {
      const ROW_COUNT = 5;
      // Spaced 10ms apart (well above 1ms) rather than any smaller gap: the
      // cursor round-trips `createdAt` through a plain JS `Date`, which only
      // resolves to millisecond precision, so two rows any closer than that
      // would tie on the cursor's own resolution even though Postgres itself
      // stores microseconds. Anchored to "now" (rather than a fixed past
      // date) so every row here sorts ahead of whatever seed/fixture data
      // already exists in the table.
      const baseTime = Date.now();
      const insertedUsers = await Promise.all(
        Array.from({ length: ROW_COUNT }, (_, index) =>
          insertUserAt(
            testDatabase.dataSource,
            { name: `zztest_page-${index}`, email: `zztest_page-${index}@example.com` },
            new Date(baseTime + index * 10),
          ),
        ),
      );
      const insertedIds = insertedUsers.map((user) => user.id);
      const insertedIdSet = new Set(insertedIds);
      const expectedOrder = [...insertedIds].reverse();

      const scopedScan: Array<{ id: string }> = await testDatabase.dataSource.query(
        `SELECT id FROM users WHERE id = ANY($1) ORDER BY created_at DESC, id DESC`,
        [insertedIds],
      );

      expect(scopedScan.map((row) => row.id)).toEqual(expectedOrder);

      // Walked two rows at a time (fewer than `ROW_COUNT`) so this exercises
      // the cursor threading correctly across page boundaries, not just that
      // one page is internally sorted. Every id outside `insertedIdSet`
      // (older seed/fixture rows, possibly sharing a page with the last of
      // this test's own rows) is filtered out below rather than asserted on
      // — this test only owns the ordering of the rows it inserted.
      const seenIds: string[] = [];
      let cursor: string | undefined;
      let pagesFetched = 0;

      while (seenIds.filter((id) => insertedIdSet.has(id)).length < ROW_COUNT) {
        const page = await userDao.findPage(2, cursor);
        pagesFetched += 1;
        seenIds.push(...page.items.map((user) => user.id));

        if (!page.nextCursor) {
          break;
        }

        cursor = page.nextCursor;
      }

      const orderedInsertedIds = seenIds.filter((id) => insertedIdSet.has(id));

      expect(orderedInsertedIds).toEqual(expectedOrder);
      expect(new Set(orderedInsertedIds).size).toBe(orderedInsertedIds.length);
      expect(pagesFetched).toBeGreaterThan(1);
    });
  });

  describe('Given:a cursor that is not valid base64-encoded JSON, When:findPage is called', () => {
    it('should throw ValidationException rather than query with it', async () => {
      await expect(userDao.findPage(10, 'not-a-valid-cursor')).rejects.toThrow(ValidationException);
    });
  });

  describe('Given:a cursor that decodes to well-formed JSON of the wrong shape, When:findPage is called', () => {
    it('should throw ValidationException', async () => {
      const wrongShapeCursor = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');

      await expect(userDao.findPage(10, wrongShapeCursor)).rejects.toThrow(ValidationException);
    });
  });
});
