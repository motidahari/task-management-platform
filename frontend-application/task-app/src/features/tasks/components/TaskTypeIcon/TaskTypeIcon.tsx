import type { ReactElement } from 'react';

import { Icon, type IconName } from '../../../../shared/components/Icon';

/**
 * Presentational type→icon map, kept entirely on the client — the workflow
 * engine stays type-agnostic, so an unknown type falls back to the generic
 * icon below rather than failing or branching on the type name.
 */
const TASK_TYPE_ICONS: Partial<Record<string, IconName>> = {
  procurement: 'package',
  development: 'wrench',
};

const DEFAULT_TASK_TYPE_ICON: IconName = 'task';

export interface TaskTypeIconProps {
  readonly type: string;
}

/** The icon for a task's type — decorative, since every caller renders the type's display name alongside it. */
export function TaskTypeIcon({ type }: TaskTypeIconProps): ReactElement {
  return <Icon name={TASK_TYPE_ICONS[type] ?? DEFAULT_TASK_TYPE_ICON} />;
}
