import type { ReactElement } from 'react';

import { Select, type SelectOption } from '../../../../shared/components/Select';
import { useTranslation } from '../../../../shared/hooks/useTranslation';

export interface AssigneeSelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly errorText?: string;
  readonly disabled?: boolean;
}

/**
 * Picks who a task goes to next, for both the advance and the reverse flow.
 * Deliberately generic: it renders whatever `options` the caller hands it and
 * owns no lookup of its own, so it stays a drop-in regardless of where a
 * caller sources its candidate list.
 */
export function AssigneeSelect({
  value,
  options,
  onChange,
  errorText,
  disabled = false,
}: AssigneeSelectProps): ReactElement {
  const { t } = useTranslation('assignee-select');

  return (
    <Select
      id="assignee-select"
      label={t('label')}
      value={value}
      options={options}
      placeholder={t('placeholder')}
      required
      disabled={disabled}
      errorText={errorText}
      onChange={onChange}
    />
  );
}
