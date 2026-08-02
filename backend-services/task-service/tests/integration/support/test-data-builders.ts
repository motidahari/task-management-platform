import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { TEST_RUN_RECORD_PREFIX } from './test-database';

/**
 * Monotonic within one test process — that, plus the run's own prefix, keeps
 * `email` unique against its unique index even while a suite out of another
 * worktree is minting records of its own against the same database.
 */
let recordSequence = 0;

function nextRecordSequence(): number {
  recordSequence += 1;

  return recordSequence;
}

/**
 * A user row carrying {@link TEST_RUN_RECORD_PREFIX} in both `name` and `email`
 * so the backstop sweep can find it too, with sensible defaults an integration
 * test can override only the field it cares about. Saving it is what the ledger
 * records; the prefix is not what gets it cleaned up.
 */
export function buildTestUser(overrides: Partial<UserEntity> = {}): Partial<UserEntity> {
  const sequence = nextRecordSequence();

  return {
    name: `${TEST_RUN_RECORD_PREFIX}user-${sequence}`,
    email: `${TEST_RUN_RECORD_PREFIX}user-${sequence}@example.com`,
    ...overrides,
  };
}

/**
 * A task row assigned to `assignedUserId` — any existing user will do, since
 * the ledger addresses this row by its own primary key rather than reaching it
 * through the assignee.
 */
export function buildTestTask(
  assignedUserId: string,
  overrides: Partial<TaskEntity> = {},
): Partial<TaskEntity> {
  return {
    type: 'procurement',
    assignedUserId,
    ...overrides,
  };
}

/**
 * A history row for `taskId`/`assignedUserId` — defaults to the task's
 * creation transition (`fromStatus: null`, `toStatus: 1`), the one shape
 * the `NOT (from_status IS NULL AND to_status IS NULL)` check always
 * accepts without a caller having to know a valid `fromStatus` in advance.
 */
export function buildTestHistoryEntry(
  taskId: string,
  assignedUserId: string,
  overrides: Partial<TaskStatusHistoryEntity> = {},
): Partial<TaskStatusHistoryEntity> {
  return {
    taskId,
    assignedUserId,
    fromStatus: null,
    toStatus: 1,
    ...overrides,
  };
}
