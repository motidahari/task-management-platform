import type { ReactElement } from 'react';

import { Avatar } from '../../../../shared/components/Avatar';
import { Badge } from '../../../../shared/components/Badge';
import { Button } from '../../../../shared/components/Button';
import { EmptyState } from '../../../../shared/components/EmptyState';
import { Table, type Column } from '../../../../shared/components/Table';
import { useTranslation, type ScopedTranslation } from '../../../../shared/hooks/useTranslation';
import type { Task } from '../../types';
import { TaskTypeIcon } from '../TaskTypeIcon';
import './TaskList.scss';

export interface TaskListProps {
  readonly tasks: readonly Task[];
  readonly isLoading: boolean;
  readonly hasMore: boolean;
  readonly onSelectTask: (taskId: string) => void;
  readonly onLoadMore: () => void;
  readonly resolveAssigneeName: (userId: string) => string;
  readonly resolveTypeDisplayName: (type: string) => string;
  readonly resolveStatusDisplayName: (type: string, status: number) => string;
  /** The task whose detail drawer is currently open, if any — highlights that row. */
  readonly selectedTaskId?: string;
}

const ID_PREFIX_LENGTH = 8;

function shortId(taskId: string): string {
  return taskId.slice(0, ID_PREFIX_LENGTH);
}

function buildColumns(
  t: ScopedTranslation['t'],
  resolveAssigneeName: (userId: string) => string,
  resolveTypeDisplayName: (type: string) => string,
  resolveStatusDisplayName: (type: string, status: number) => string,
): readonly Column<Task>[] {
  return [
    {
      key: 'id',
      header: t('id-column'),
      renderCell: (task) => (
        <span className="task-list__id" title={task.id}>
          {shortId(task.id)}
        </span>
      ),
    },
    {
      key: 'type',
      header: t('type-column'),
      renderCell: (task) => (
        <span className="task-list__type">
          <TaskTypeIcon type={task.type} />
          {resolveTypeDisplayName(task.type)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status-column'),
      renderCell: (task) => (
        <Badge variant={task.isClosed ? 'neutral' : 'info'}>
          {task.isClosed
            ? t('closed-badge')
            : t('status-badge', {
                status: task.status,
                statusName: resolveStatusDisplayName(task.type, task.status),
              })}
        </Badge>
      ),
    },
    {
      key: 'state',
      header: t('state-column'),
      renderCell: (task) => (
        <Badge variant={task.isClosed ? 'neutral' : 'success'}>
          {task.isClosed ? t('state-closed') : t('state-open')}
        </Badge>
      ),
    },
    {
      key: 'assignee',
      header: t('assignee-column'),
      renderCell: (task) => {
        const assigneeName = resolveAssigneeName(task.assignedUserId);
        return (
          <span className="task-list__assignee">
            <Avatar seed={task.assignedUserId} size={24} alt={assigneeName} />
            {assigneeName}
          </span>
        );
      },
    },
  ];
}

/**
 * The keyset-paginated table of a user's tasks: the `Table`'s own loading
 * skeleton on first load, an `EmptyState` when there's nothing, the loaded
 * page otherwise, and a "Load more" action while the server still has a next
 * page. The cursor itself lives with the caller — this only renders what it
 * is given.
 */
export function TaskList({
  tasks,
  isLoading,
  hasMore,
  onSelectTask,
  onLoadMore,
  resolveAssigneeName,
  resolveTypeDisplayName,
  resolveStatusDisplayName,
  selectedTaskId,
}: TaskListProps): ReactElement {
  const { t } = useTranslation('task-list');
  const columns = buildColumns(
    t,
    resolveAssigneeName,
    resolveTypeDisplayName,
    resolveStatusDisplayName,
  );

  return (
    <div className="task-list" data-testid="task-list">
      <Table
        columns={columns}
        rows={tasks}
        getRowId={(task) => task.id}
        onRowSelect={(task) => onSelectTask(task.id)}
        selectedRowId={selectedTaskId}
        isLoading={isLoading}
        emptyState={<EmptyState icon="inbox" title={t('empty-state')} />}
        caption={t('table-caption')}
        testId="task-list-table"
      />
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
