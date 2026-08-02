import { randomUUID } from 'node:crypto';

import { ValidationException } from '@core/shared';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UserDao } from '../../../src/domain/user.dao';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { buildTestUser } from '../support/test-data-builders';
import {
  isTestDatabaseConfigured,
  TEST_RUN_RECORD_PREFIX,
  useTestDatabase,
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
  createdAt: Date | string,
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
  const testDatabase = useTestDatabase();
  let userDao: UserDao;

  beforeAll(() => {
    userDao = new UserDao(testDatabase.dataSource, testDatabase.dataSource);
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
      await expect(userDao.getById(randomUUID())).rejects.toThrow(NotFoundException);
    });
  });

  describe('Given:more inserted users than fit on one page, When:paginating with a small limit', () => {
    it('should walk every inserted row exactly once, newest-first, agreeing with a created_at/id DESC scan restricted to those rows', async () => {
      const ROW_COUNT = 5;
      // Spaced 10ms apart so this test owns a strict, unambiguous newest-first
      // order to assert on; the exact-same-instant case (several rows tied on
      // `created_at` down to the microsecond) is covered separately below.
      // Anchored to "now" (rather than a fixed past date) so every row here
      // sorts ahead of whatever seed/fixture data already exists in the table.
      const baseTime = Date.now();
      const insertedUsers = await Promise.all(
        Array.from({ length: ROW_COUNT }, (_, index) =>
          insertUserAt(
            testDatabase.dataSource,
            {
              name: `${TEST_RUN_RECORD_PREFIX}page-${index}`,
              email: `${TEST_RUN_RECORD_PREFIX}page-${index}@example.com`,
            },
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

  describe('Given:several users sharing the exact same created_at, down to the microsecond, right at a page boundary, When:paginating', () => {
    it('should serve every row exactly once across pages, in stable created_at/id DESC order', async () => {
      // Carries a non-zero microsecond fraction deliberately: a `Date`-valued
      // instant only ever lands on an exact millisecond, which a cursor could
      // serialize losslessly even truncated to millisecond precision — this
      // is the shape that actually exercises the boundary. Anchored to "now"
      // so every row here sorts ahead of whatever seed/fixture data already
      // exists in the table.
      const sharedInstant = `${new Date().toISOString().replace(/\.\d{3}Z$/, '')}.757772Z`;

      const insertedUsers = await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          insertUserAt(
            testDatabase.dataSource,
            {
              name: `${TEST_RUN_RECORD_PREFIX}tie-${index}`,
              email: `${TEST_RUN_RECORD_PREFIX}tie-${index}@example.com`,
            },
            sharedInstant,
          ),
        ),
      );
      const insertedIds = insertedUsers.map((user) => user.id);

      const insertedIdSet = new Set(insertedIds);
      const expectedOrder: Array<{ id: string }> = await testDatabase.dataSource.query(
        `SELECT id FROM users WHERE id = ANY($1) ORDER BY created_at DESC, id DESC`,
        [insertedIds],
      );

      // Walked in a loop rather than two fixed pages, the same convention the
      // spaced-apart pagination test above uses: it tolerates whatever
      // unrelated rows land ahead of this test's own on the very first page.
      const seenIds: string[] = [];
      let cursor: string | undefined;

      while (seenIds.filter((id) => insertedIdSet.has(id)).length < insertedIds.length) {
        const page = await userDao.findPage(2, cursor);
        seenIds.push(...page.items.map((user) => user.id));

        if (!page.nextCursor) {
          break;
        }

        cursor = page.nextCursor;
      }

      const servedIds = seenIds.filter((id) => insertedIdSet.has(id));

      expect(servedIds).toEqual(expectedOrder.map((row) => row.id));
      expect(new Set(servedIds).size).toBe(insertedIds.length);
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
