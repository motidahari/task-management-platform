import { TaskEntity } from '../../../src/domain/entities/task.entity';
import { TaskStatusHistoryEntity } from '../../../src/domain/entities/task-status-history.entity';
import { UserEntity } from '../../../src/domain/entities/user.entity';
import { TEST_RECORD_PREFIX } from './test-database';

/**
 * Monotonic within one test process — enough to keep `email`/`name` unique
 * across builder calls in the same suite without pulling in a UUID
 * dependency just for a display value.
 */
let recordSequence = 0;

function nextRecordSequence(): number {
  recordSequence += 1;

  return recordSequence;
}

/**
 * A user row carrying {@link TEST_RECORD_PREFIX} in both `name` and `email`
 * so {@link cleanupTestDatabase} always finds it, with sensible defaults an
 * integration test can override only the field it cares about.
 */
export function buildTestUser(overrides: Partial<UserEntity> = {}): Partial<UserEntity> {
  const sequence = nextRecordSequence();

  return {
    name: `${TEST_RECORD_PREFIX}user-${sequence}`,
    email: `${TEST_RECORD_PREFIX}user-${sequence}@example.com`,
    ...overrides,
  };
}

/**
 * A task row assigned to `assignedUserId` — pass a user built by
 * {@link buildTestUser} (and saved first) so cleanup's user-prefix filter
 * reaches this row through the FK.
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
