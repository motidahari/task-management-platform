import type { ReactElement, ReactNode } from 'react';

import './Card.scss';

export interface CardProps {
  readonly children: ReactNode;
  readonly testId?: string;
}

/** The only elevated surface in the app — `TaskCard`/detail panels compose this instead of a raw `<div>`. */
export function Card({ children, testId }: CardProps): ReactElement {
  return (
    <div className="card" data-testid={testId}>
      {children}
    </div>
  );
}
