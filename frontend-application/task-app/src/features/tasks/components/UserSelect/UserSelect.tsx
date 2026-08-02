import type { ReactElement } from 'react';

import { Avatar } from '../../../../shared/components/Avatar';
import { Select, type SelectOption } from '../../../../shared/components/Select';
import type { User } from '../../types';

export interface UserSelectProps {
  readonly id: string;
  readonly label: string;
  readonly users: readonly User[];
  readonly value: string;
  readonly onChange: (userId: string) => void;
  readonly placeholder?: string;
  readonly errorText?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
}

function toUserOptions(users: readonly User[]): SelectOption[] {
  return users.map((user) => ({
    value: user.id,
    label: user.name,
    icon: <Avatar seed={user.id} size={20} />,
  }));
}

/**
 * The only place a `User[]` becomes a dropdown — the "viewing tasks for"
 * picker and every assignee field compose this instead of mapping users to
 * `SelectOption[]` themselves.
 */
export function UserSelect({
  id,
  label,
  users,
  value,
  onChange,
  placeholder,
  errorText,
  required = false,
  disabled = false,
}: UserSelectProps): ReactElement {
  return (
    <Select
      id={id}
      label={label}
      value={value}
      options={toUserOptions(users)}
      onChange={onChange}
      placeholder={placeholder}
      errorText={errorText}
      required={required}
      disabled={disabled}
    />
  );
}
