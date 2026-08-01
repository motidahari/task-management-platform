import type { ReactElement } from 'react';

import './Stepper.scss';

export type StepperStepState = 'done' | 'current' | 'upcoming';

export interface StepperStep {
  readonly id: string;
  readonly label: string;
  readonly state: StepperStepState;
}

export type StepperOrientation = 'horizontal' | 'vertical';

export interface StepperProps {
  readonly steps: readonly StepperStep[];
  readonly ariaLabel: string;
  readonly orientation?: StepperOrientation;
}

/**
 * A generic, presentational sequence of numbered steps — knows nothing about
 * tasks or any other domain; a feature composes this with its own step data
 * instead of duplicating the numbered-circle-and-connector markup.
 */
export function Stepper({
  steps,
  ariaLabel,
  orientation = 'horizontal',
}: StepperProps): ReactElement {
  return (
    <ol className={`stepper stepper--${orientation}`} aria-label={ariaLabel} data-testid="stepper">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`stepper__step stepper__step--${step.state}`}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className="stepper__circle" aria-hidden="true">
            {step.state === 'done' ? '✓' : index + 1}
          </span>
          <span className="stepper__label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
