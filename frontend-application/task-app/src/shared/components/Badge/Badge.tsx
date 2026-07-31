import type { ReactElement, ReactNode } from 'react';

import './Badge.scss';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
}

/** The only status/closed indicator in the app — `TaskCard`/`StatusStepper` compose this instead of ad-hoc styled text. */
export function Badge({ children, variant = 'neutral' }: BadgeProps): ReactElement {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
