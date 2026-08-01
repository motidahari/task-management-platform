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
}

function resolveStepState(status: number, currentStatus: number): StepperStepState {
  if (status === currentStatus) return 'current';
  if (status < currentStatus) return 'done';
  return 'upcoming';
}

function toStepperSteps(
  statuses: readonly StatusDefinition[],
  currentStatus: number,
): StepperStep[] {
  return statuses.map((status) => ({
    id: String(status.status),
    label: status.displayName,
    state: resolveStepState(status.status, currentStatus),
  }));
}

/**
 * Maps the task-type metadata's status chain onto the shared `Stepper`, so a
 * new status registered on the backend appears in the chain with no change
 * here. Stays type-agnostic and owns no step markup or ARIA semantics of its
 * own — those live entirely in `Stepper`.
 */
export function StatusStepper({ statuses, currentStatus }: StatusStepperProps): ReactElement {
  const { t } = useTranslation('status-stepper');

  return (
    <div className="status-stepper" data-testid="status-stepper">
      <Stepper
        steps={toStepperSteps(statuses, currentStatus)}
        ariaLabel={t('aria-label')}
        orientation="vertical"
      />
    </div>
  );
}
