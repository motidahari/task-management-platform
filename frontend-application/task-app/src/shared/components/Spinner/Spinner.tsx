import type { ReactElement } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import './Spinner.scss';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  readonly size?: SpinnerSize;
}

/** A single visual loading indicator, reused wherever a view/button/gate is waiting on data. */
export function Spinner({ size = 'md' }: SpinnerProps): ReactElement {
  const { t } = useTranslation('spinner');

  return (
    <span className={`spinner spinner--${size}`} role="status" aria-live="polite">
      <span className="visually-hidden">{t('loading-label')}</span>
    </span>
  );
}
