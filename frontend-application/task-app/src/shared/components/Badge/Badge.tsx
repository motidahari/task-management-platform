import type { ReactElement, ReactNode } from 'react';

import './Badge.scss';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeTone = 'soft' | 'solid';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
  readonly tone?: BadgeTone;
  readonly size?: BadgeSize;
}

/** The only status/closed indicator in the app — the task table and detail view compose this instead of ad-hoc styled text. */
export function Badge({
  children,
  variant = 'neutral',
  tone = 'solid',
  size = 'sm',
}: BadgeProps): ReactElement {
  return (
    <span className={`badge badge--${variant} badge--${tone} badge--${size}`}>{children}</span>
  );
}
