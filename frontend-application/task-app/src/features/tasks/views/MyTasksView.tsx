import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router';

import { useBus } from '../../../core/bus/useBus';
import { Avatar } from '../../../shared/components/Avatar';
import { Button } from '../../../shared/components/Button';
import { useTranslation } from '../../../shared/hooks/useTranslation';
import { TaskList } from '../components/TaskList';
import { UserGate } from '../components/UserGate';
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
 * This view renders above the detail route rather than on it, so its own
 * `useParams` never carries the task id — matching the child path is what
 * surfaces the task the drawer is showing, whether it was reached by client
 * navigation or a direct deep link.
 */
const TASK_DETAIL_PATH = '/users/:userId/tasks/:taskId';

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
      onSelectTask={(taskId) => void navigate(`/users/${userId}/tasks/${taskId}`)}
      onLoadMore={handleLoadMore}
      resolveAssigneeName={resolveAssigneeName}
      resolveTypeDisplayName={resolveTypeDisplayName}
      resolveStatusDisplayName={resolveStatusDisplayName}
      selectedTaskId={selectedTaskId}
    />
  );
}

/**
 * The landing screen: connect as a user, filter their tasks open/closed,
 * page through them in a table, and create a new one via the modal. Task
 * data itself stays entirely in `useTaskStore`/`useCurrentUserStore` — this
 * view only wires the route-scoped user id and the filter into their
 * actions. Also hosts the `Outlet` for the task-detail route, so the table
 * stays mounted behind whatever renders there.
 *
 * The user id comes from the route (`/users/:userId`), never from a store —
 * that keeps a list URL a single, reloadable source of truth for whose list
 * it is. Until the directory confirms that id is real, this renders the same
 * error path `ConnectView` does rather than a blank list, covering both an
 * unknown id and a directory that failed to load.
 */
export function MyTasksView(): ReactElement {
  const { t } = useTranslation('my-tasks-view');
  const { emit } = useBus();
  const navigate = useNavigate();
  const userId = useParams<{ userId: string }>().userId ?? '';
  const selectedTaskId = useMatch(TASK_DETAIL_PATH)?.params.taskId;
  const users = useCurrentUserStore((state) => state.users);
  const isLoadingUsers = useCurrentUserStore((state) => state.isLoading);
  const usersError = useCurrentUserStore((state) => state.error);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);
  const typeDefinitions = useTaskTypeStore((state) => state.definitions);

  const [isClosedFilter, setIsClosedFilter] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const isUserKnown = users.some((user) => user.id === userId);
  const isDirectoryResolved = !isLoadingUsers && usersError === null;
  const showList = isDirectoryResolved && isUserKnown;

  const assigneeNamesById = useMemo(() => buildAssigneeNameLookup(users), [users]);
  const resolveAssigneeName = useCallback(
    (assigneeId: string) => assigneeNamesById[assigneeId] ?? assigneeId,
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
      {!showList ? (
        <UserGate
          users={users}
          isLoading={isLoadingUsers}
          hasError={!isLoadingUsers && (usersError !== null || !isUserKnown)}
          errorTitle={usersError === null ? t('unknown-user-title') : undefined}
          onConnect={(nextUserId) => void navigate(`/users/${nextUserId}`)}
          onRetry={() => void fetchUsers()}
        />
      ) : (
        <>
          <section className="my-tasks-view__toolbar">
            <div className="my-tasks-view__current-user">
              <Avatar seed={userId} alt={resolveAssigneeName(userId)} size={32} />
              <UserSelect
                id="my-tasks-view-user"
                label={t('user-picker-label')}
                users={users}
                value={userId}
                onChange={(nextUserId) => void navigate(`/users/${nextUserId}`)}
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
            userId={userId}
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
