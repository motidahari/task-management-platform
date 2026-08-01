import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router';

import { useBus } from '../../../core/bus/useBus';
import { Avatar } from '../../../shared/components/Avatar';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useTranslation } from '../../../shared/hooks/useTranslation';
import { TaskList } from '../components/TaskList';
import { UserSelect } from '../components/UserSelect';
import { useTaskRealtime } from '../hooks/useTaskRealtime';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import { useTaskStore } from '../stores/useTaskStore';
import { useTaskTypeStore } from '../stores/useTaskTypeStore';
import type { TaskTypeDefinition, User } from '../types';
import './MyTasksView.scss';

/**
 * Task/history payloads carry only an assignee id, by contract — this is the
 * one place that turns those ids into the names users see, falling back to
 * the raw id for anyone outside the loaded directory rather than a blank.
 */
function buildAssigneeNameLookup(users: readonly User[]): Record<string, string> {
  return Object.fromEntries(users.map((user) => [user.id, user.name]));
}

/**
 * Tasks carry only a type key, by contract — this is the one place that
 * turns it into the display name from the loaded type metadata, falling
 * back to the raw key for a type the client hasn't loaded metadata for.
 */
function buildTypeDisplayNameLookup(
  definitions: readonly TaskTypeDefinition[],
): Record<string, string> {
  return Object.fromEntries(
    definitions.map((definition) => [definition.type, definition.displayName]),
  );
}

/**
 * A task carries its status as a number plus the raw status key; the readable
 * name for it lives in the same type metadata the stepper reads, so both
 * surfaces name a status identically instead of one showing the raw key.
 */
function buildStatusDisplayNameLookup(
  definitions: readonly TaskTypeDefinition[],
): Record<string, string> {
  return Object.fromEntries(
    definitions.flatMap((definition) =>
      definition.statuses.map((status) => [
        `${definition.type}:${status.status}`,
        status.displayName,
      ]),
    ),
  );
}

/**
 * This view renders above the detail route rather than on it, so `useParams`
 * never carries that id here — matching the child path is what surfaces the
 * task the drawer is showing, whether it was reached by client navigation or
 * a direct deep link.
 */
const TASK_DETAIL_PATH = '/tasks/:taskId';

interface TaskListSectionProps {
  readonly userId: string;
  readonly isClosed: boolean;
  readonly selectedTaskId: string | undefined;
  readonly resolveAssigneeName: (userId: string) => string;
  readonly resolveTypeDisplayName: (type: string) => string;
  readonly resolveStatusDisplayName: (type: string, status: number) => string;
}

/**
 * Everything that depends on a selected user: the loaded page for the
 * current user/filter pair, its live updates, and "load more". Split out of
 * `MyTasksView` so the realtime room join only ever runs with a real user id
 * — hooks can't be called conditionally, and there is nothing to watch
 * before a user is picked.
 */
function TaskListSection({
  userId,
  isClosed,
  selectedTaskId,
  resolveAssigneeName,
  resolveTypeDisplayName,
  resolveStatusDisplayName,
}: TaskListSectionProps): ReactElement {
  const navigate = useNavigate();
  const items = useTaskStore((state) => state.items);
  const nextCursor = useTaskStore((state) => state.nextCursor);
  const isLoading = useTaskStore((state) => state.isLoading);
  const fetchTasksForUser = useTaskStore((state) => state.fetchTasksForUser);

  const refetchFirstPage = useCallback((): void => {
    void fetchTasksForUser(userId, { isClosed });
  }, [fetchTasksForUser, userId, isClosed]);

  useEffect(() => {
    refetchFirstPage();
  }, [refetchFirstPage]);

  useTaskRealtime({ mode: 'list', userId }, refetchFirstPage);

  function handleLoadMore(): void {
    void fetchTasksForUser(userId, { isClosed, cursor: nextCursor ?? undefined });
  }

  return (
    <TaskList
      tasks={items}
      isLoading={isLoading}
      hasMore={nextCursor !== null}
      onSelectTask={(taskId) => void navigate(`/tasks/${taskId}`)}
      onLoadMore={handleLoadMore}
      resolveAssigneeName={resolveAssigneeName}
      resolveTypeDisplayName={resolveTypeDisplayName}
      resolveStatusDisplayName={resolveStatusDisplayName}
      selectedTaskId={selectedTaskId}
    />
  );
}

const GATE_SKELETON_ROW_COUNT = 3;

interface UserGateProps {
  readonly users: readonly User[];
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly onConnect: (userId: string) => void;
  readonly onRetry: () => void;
}

/**
 * The screen shown before any user is picked: every seeded user as an
 * identity to connect as, rather than a bare dropdown — there is nothing
 * else useful to show (no tasks, no create action) until one is chosen.
 */
function UserGate({ users, isLoading, hasError, onConnect, onRetry }: UserGateProps): ReactElement {
  const { t } = useTranslation('my-tasks-view');

  return (
    <div className="my-tasks-view__gate">
      <Card testId="my-tasks-view-user-gate">
        <h2 className="my-tasks-view__gate-title">{t('gate-title')}</h2>
        {hasError ? (
          <EmptyState
            icon="alert"
            title={t('gate-error-title')}
            action={
              <Button onClick={onRetry} testId="my-tasks-view-gate-retry">
                {t('gate-retry-button')}
              </Button>
            }
          />
        ) : isLoading ? (
          <ul className="my-tasks-view__gate-list" aria-hidden="true">
            {Array.from({ length: GATE_SKELETON_ROW_COUNT }, (_, index) => (
              <li className="my-tasks-view__gate-item" key={index}>
                <Skeleton variant="circle" width={40} height={40} />
                <Skeleton variant="text" width="60%" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="my-tasks-view__gate-list">
            {users.map((user) => (
              <li className="my-tasks-view__gate-item" key={user.id}>
                <Avatar seed={user.id} alt={user.name} />
                <span className="my-tasks-view__gate-name">{user.name}</span>
                <Button
                  onClick={() => onConnect(user.id)}
                  testId={`my-tasks-view-connect-${user.id}`}
                >
                  {t('connect-button')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/**
 * The landing screen: connect as a user, filter their tasks open/closed,
 * page through them in a table, and create a new one via the modal. Task
 * data itself stays entirely in `useTaskStore`/`useCurrentUserStore` — this
 * view only wires the selection and filter into their actions. Also hosts
 * the `Outlet` for the task-detail route, so the table stays mounted behind
 * whatever renders there.
 */
export function MyTasksView(): ReactElement {
  const { t } = useTranslation('my-tasks-view');
  const { emit } = useBus();
  const selectedTaskId = useMatch(TASK_DETAIL_PATH)?.params.taskId;
  const users = useCurrentUserStore((state) => state.users);
  const selectedUserId = useCurrentUserStore((state) => state.selectedUserId);
  const isLoadingUsers = useCurrentUserStore((state) => state.isLoading);
  const usersError = useCurrentUserStore((state) => state.error);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);
  const selectUser = useCurrentUserStore((state) => state.selectUser);
  const typeDefinitions = useTaskTypeStore((state) => state.definitions);

  const [isClosedFilter, setIsClosedFilter] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const assigneeNamesById = useMemo(() => buildAssigneeNameLookup(users), [users]);
  const resolveAssigneeName = useCallback(
    (userId: string) => assigneeNamesById[userId] ?? userId,
    [assigneeNamesById],
  );

  const typeDisplayNamesByType = useMemo(
    () => buildTypeDisplayNameLookup(typeDefinitions),
    [typeDefinitions],
  );
  const resolveTypeDisplayName = useCallback(
    (type: string) => typeDisplayNamesByType[type] ?? type,
    [typeDisplayNamesByType],
  );

  const statusDisplayNamesByKey = useMemo(
    () => buildStatusDisplayNameLookup(typeDefinitions),
    [typeDefinitions],
  );
  const resolveStatusDisplayName = useCallback(
    (type: string, status: number) =>
      statusDisplayNamesByKey[`${type}:${status}`] ?? String(status),
    [statusDisplayNamesByKey],
  );

  function openCreateTaskModal(): void {
    emit('modal:open', { id: 'create-task', props: {} });
  }

  return (
    <div className="my-tasks-view">
      {selectedUserId === null ? (
        <UserGate
          users={users}
          isLoading={isLoadingUsers}
          hasError={usersError !== null}
          onConnect={selectUser}
          onRetry={() => void fetchUsers()}
        />
      ) : (
        <>
          <section className="my-tasks-view__toolbar">
            <div className="my-tasks-view__current-user">
              <Avatar seed={selectedUserId} alt={resolveAssigneeName(selectedUserId)} size={32} />
              <UserSelect
                id="my-tasks-view-user"
                label={t('user-picker-label')}
                users={users}
                value={selectedUserId}
                onChange={selectUser}
                placeholder={t('user-picker-placeholder')}
                disabled={isLoadingUsers}
              />
            </div>
            <div className="my-tasks-view__filter" role="group" aria-label={t('filter-label')}>
              <Button
                variant={isClosedFilter ? 'secondary' : 'primary'}
                onClick={() => setIsClosedFilter(false)}
                testId="my-tasks-view-filter-open"
              >
                {t('filter-open')}
              </Button>
              <Button
                variant={isClosedFilter ? 'primary' : 'secondary'}
                onClick={() => setIsClosedFilter(true)}
                testId="my-tasks-view-filter-closed"
              >
                {t('filter-closed')}
              </Button>
            </div>
            <Button icon="plus" onClick={openCreateTaskModal} testId="my-tasks-view-create-task">
              {t('create-task-button')}
            </Button>
          </section>

          <TaskListSection
            userId={selectedUserId}
            isClosed={isClosedFilter}
            selectedTaskId={selectedTaskId}
            resolveAssigneeName={resolveAssigneeName}
            resolveTypeDisplayName={resolveTypeDisplayName}
            resolveStatusDisplayName={resolveStatusDisplayName}
          />
        </>
      )}
      <Outlet />
    </div>
  );
}
