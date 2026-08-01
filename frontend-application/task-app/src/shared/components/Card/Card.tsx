import type { ReactElement, ReactNode } from 'react';

import './Card.scss';

export type CardPadding = 'none' | 'sm' | 'md';
export type CardElevation = 'flat' | 'raised';

export interface CardProps {
  readonly children: ReactNode;
  readonly padding?: CardPadding;
  readonly elevation?: CardElevation;
  readonly testId?: string;
}

/** The only elevated surface in the app — the user gate and other detail panels compose this instead of a raw `<div>`. */
export function Card({
  children,
  padding = 'md',
  elevation = 'flat',
  testId,
}: CardProps): ReactElement {
  return (
    <div className={`card card--padding-${padding} card--${elevation}`} data-testid={testId}>
      {children}
    </div>
  );
}
