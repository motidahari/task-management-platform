import type { MouseEventHandler, ReactElement, ReactNode } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import { Icon, type IconName } from '../Icon';
import { Spinner } from '../Spinner';
import './Button.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
  readonly icon?: IconName;
  readonly type?: 'button' | 'submit';
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly testId?: string;
}

/** The only clickable action element in the app — every form/action button composes this instead of a raw `<button>`. */
export function Button({
  children,
  variant = 'primary',
  icon,
  type = 'button',
  loading = false,
  disabled = false,
  onClick,
  testId,
}: ButtonProps): ReactElement {
  const { t } = useTranslation('button');
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={`button button--${variant}${loading ? ' button--loading' : ''}`}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading}
      data-testid={testId}
    >
      {loading && <Spinner size="sm" />}
      {!loading && icon && (
        <span className="button__icon">
          <Icon name={icon} />
        </span>
      )}
      <span className="button__label">{children}</span>
      {loading && <span className="visually-hidden">{t('loading-label')}</span>}
    </button>
  );
}
