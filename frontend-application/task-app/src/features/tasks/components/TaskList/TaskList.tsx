import type { ReactElement } from 'react';

import { Button } from '../../../../shared/components/Button';
import { Spinner } from '../../../../shared/components/Spinner';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { Task } from '../../types';
import { TaskCard } from '../TaskCard';
import './TaskList.scss';

export interface TaskListProps {
  readonly tasks: readonly Task[];
  readonly isLoading: boolean;
  readonly hasMore: boolean;
  readonly onSelectTask: (taskId: string) => void;
  readonly onLoadMore: () => void;
  readonly resolveAssigneeName: (userId: string) => string;
}

/**
 * The keyset-paginated grid of a user's tasks: an initial-load spinner, an
 * empty state when there's nothing, the loaded page otherwise, and a
 * "Load more" action while the server still has a next page. The cursor
 * itself lives with the caller — this only renders what it is given.
 */
export function TaskList({
  tasks,
  isLoading,
  hasMore,
  onSelectTask,
  onLoadMore,
  resolveAssigneeName,
}: TaskListProps): ReactElement {
  const { t } = useTranslation('task-list');
  const isInitialLoad = isLoading && tasks.length === 0;
  const showEmptyState = !isLoading && tasks.length === 0;

  return (
    <div className="task-list" data-testid="task-list">
      {isInitialLoad && <Spinner />}
      {showEmptyState && <p className="task-list__empty">{t('empty-state')}</p>}
      {tasks.length > 0 && (
        <div className="task-list__grid">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={resolveAssigneeName(task.assignedUserId)}
              onSelect={onSelectTask}
            />
          ))}
        </div>
      )}
      {hasMore && (
        <Button
          variant="secondary"
          loading={isLoading}
          onClick={onLoadMore}
          testId="task-list-load-more"
        >
          {t('load-more-button')}
        </Button>
      )}
    </div>
  );
}
