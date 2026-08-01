import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../../../shared/components/Button';
import { useTranslation } from '../../../shared/hooks/useTranslation';
import { CreateTaskForm } from '../components/CreateTaskForm';
import { TaskList } from '../components/TaskList';
import { UserSelect } from '../components/UserSelect';
import { useTaskRealtime } from '../hooks/useTaskRealtime';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import { useTaskStore } from '../stores/useTaskStore';
import type { User } from '../types';
import './MyTasksView.scss';

/**
 * Task/history payloads carry only an assignee id, by contract — this is the
 * one place that turns those ids into the names users see, falling back to
 * the raw id for anyone outside the loaded directory rather than a blank.
 */
function buildAssigneeNameLookup(users: readonly User[]): Record<string, string> {
  return Object.fromEntries(users.map((user) => [user.id, user.name]));
}

interface TaskListSectionProps {
  readonly userId: string;
  readonly isClosed: boolean;
  readonly resolveAssigneeName: (userId: string) => string;
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
  resolveAssigneeName,
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
    />
  );
}

/**
 * The landing screen: pick a user, filter their tasks open/closed, page
 * through them, and create a new one inline. Task data itself stays entirely
 * in `useTaskStore`/`useCurrentUserStore` — this view only wires the
 * selection and filter into their actions.
 */
export function MyTasksView(): ReactElement {
  const { t } = useTranslation('my-tasks-view');
  const users = useCurrentUserStore((state) => state.users);
  const selectedUserId = useCurrentUserStore((state) => state.selectedUserId);
  const isLoadingUsers = useCurrentUserStore((state) => state.isLoading);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);
  const selectUser = useCurrentUserStore((state) => state.selectUser);

  const [isClosedFilter, setIsClosedFilter] = useState(false);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const assigneeNamesById = useMemo(() => buildAssigneeNameLookup(users), [users]);
  const resolveAssigneeName = useCallback(
    (userId: string) => assigneeNamesById[userId] ?? userId,
    [assigneeNamesById],
  );

  return (
    <div className="my-tasks-view">
      <section className="my-tasks-view__toolbar">
        <UserSelect
          id="my-tasks-view-user"
          label={t('user-picker-label')}
          users={users}
          value={selectedUserId ?? ''}
          onChange={selectUser}
          placeholder={t('user-picker-placeholder')}
          disabled={isLoadingUsers}
        />
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
      </section>

      <div className="my-tasks-view__panes">
        <section className="my-tasks-view__list-pane">
          {selectedUserId !== null ? (
            <TaskListSection
              userId={selectedUserId}
              isClosed={isClosedFilter}
              resolveAssigneeName={resolveAssigneeName}
            />
          ) : (
            <p className="my-tasks-view__empty-state">{t('select-user-prompt')}</p>
          )}
        </section>
        <section className="my-tasks-view__create-pane">
          <CreateTaskForm />
        </section>
      </div>
    </div>
  );
}
