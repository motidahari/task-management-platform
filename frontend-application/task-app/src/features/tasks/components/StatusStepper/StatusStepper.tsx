import type { ReactElement } from 'react';

import { Badge, type BadgeVariant } from '../../../../shared/components/Badge';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { StatusDefinition } from '../../types';
import './StatusStepper.scss';

export interface StatusStepperProps {
  readonly statuses: readonly StatusDefinition[];
  readonly currentStatus: number;
}

function resolveStepVariant(isCurrent: boolean, isCompleted: boolean): BadgeVariant {
  if (isCurrent) return 'info';
  if (isCompleted) return 'success';
  return 'neutral';
}

function resolveStepClassName(isCurrent: boolean): string {
  return isCurrent ? 'status-stepper__step status-stepper__step--current' : 'status-stepper__step';
}

/**
 * Renders the ordered status chain straight from the task-type metadata and
 * marks the one the task is currently at, so a new status registered on the
 * backend appears in the chain with no change here.
 */
export function StatusStepper({ statuses, currentStatus }: StatusStepperProps): ReactElement {
  const { t } = useTranslation('status-stepper');

  return (
    <ol className="status-stepper" aria-label={t('aria-label')} data-testid="status-stepper">
      {statuses.map((status) => {
        const isCurrent = status.status === currentStatus;
        const isCompleted = status.status < currentStatus;

        return (
          <li
            key={status.status}
            className={resolveStepClassName(isCurrent)}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <Badge variant={resolveStepVariant(isCurrent, isCompleted)}>{status.displayName}</Badge>
          </li>
        );
      })}
    </ol>
  );
}
