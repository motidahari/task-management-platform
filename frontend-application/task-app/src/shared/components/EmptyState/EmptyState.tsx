import type { ReactElement, ReactNode } from 'react';

import { Icon, type IconName } from '../Icon';
import './EmptyState.scss';

export interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

/** Replaces a bare empty/prompt paragraph wherever a list, gate or panel has nothing to show. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps): ReactElement {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={32} />
      </span>
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
