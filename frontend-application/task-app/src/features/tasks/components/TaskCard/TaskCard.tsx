import type { ReactElement } from 'react';

import { Badge, type BadgeVariant } from '../../../../shared/components/Badge';
import { Card } from '../../../../shared/components/Card';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { Task } from '../../types';
import './TaskCard.scss';

export interface TaskCardProps {
  readonly task: Task;
  readonly assigneeName: string;
  readonly onSelect: (taskId: string) => void;
}

function resolveStatusBadgeVariant(isClosed: boolean): BadgeVariant {
  return isClosed ? 'neutral' : 'info';
}

/**
 * One assignment in a user's list — its type, current status, and open/
 * closed state, clickable through to its detail view. Presentation only:
 * which task it renders and what happens on selection both come from the
 * caller, so it stays reusable across every list that shows tasks.
 */
export function TaskCard({ task, assigneeName, onSelect }: TaskCardProps): ReactElement {
  const { t } = useTranslation('task-card');

  return (
    <Card testId="task-card">
      <button
        type="button"
        className="task-card__button"
        onClick={() => onSelect(task.id)}
        data-testid={`task-card-${task.id}`}
      >
        <span className="task-card__type">{task.type}</span>
        <Badge variant={resolveStatusBadgeVariant(task.isClosed)}>
          {task.isClosed ? t('closed-badge') : task.statusName}
        </Badge>
        <span className="task-card__assignee">{t('assignee-label', { name: assigneeName })}</span>
      </button>
    </Card>
  );
}
