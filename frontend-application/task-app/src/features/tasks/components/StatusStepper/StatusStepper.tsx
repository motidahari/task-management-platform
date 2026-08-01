import type { ReactElement } from 'react';

import {
  Stepper,
  type StepperStep,
  type StepperStepState,
} from '../../../../shared/components/Stepper';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { StatusDefinition } from '../../types';
import './StatusStepper.scss';

export interface StatusStepperProps {
  readonly statuses: readonly StatusDefinition[];
  readonly currentStatus: number;
  readonly isClosed?: boolean;
}

/**
 * Closure is terminal, so a closed task has no step left in progress — the
 * status it stopped at counts as done rather than current.
 */
function resolveStepState(
  status: number,
  currentStatus: number,
  isClosed: boolean,
): StepperStepState {
  if (status < currentStatus || (isClosed && status === currentStatus)) return 'done';
  if (status === currentStatus) return 'current';
  return 'upcoming';
}

function toStepperSteps(
  statuses: readonly StatusDefinition[],
  currentStatus: number,
  isClosed: boolean,
): StepperStep[] {
  return statuses.map((status) => ({
    id: String(status.status),
    label: status.displayName,
    state: resolveStepState(status.status, currentStatus, isClosed),
  }));
}

/**
 * Maps the task-type metadata's status chain onto the shared `Stepper`, so a
 * new status registered on the backend appears in the chain with no change
 * here. Stays type-agnostic and owns no step markup or ARIA semantics of its
 * own — those live entirely in `Stepper`.
 */
export function StatusStepper({
  statuses,
  currentStatus,
  isClosed = false,
}: StatusStepperProps): ReactElement {
  const { t } = useTranslation('status-stepper');

  return (
    <div className="status-stepper" data-testid="status-stepper">
      <Stepper
        steps={toStepperSteps(statuses, currentStatus, isClosed)}
        ariaLabel={t('aria-label')}
        orientation="vertical"
      />
    </div>
  );
}
