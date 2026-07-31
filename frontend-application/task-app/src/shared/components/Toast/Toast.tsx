import type { ReactElement } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import './Toast.scss';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastProps {
  readonly kind: ToastKind;
  readonly message: string;
  readonly onDismiss: () => void;
}

/** A single stacked notification — `ToastHost` is the only place that renders one, always from a bus event. */
export function Toast({ kind, message, onDismiss }: ToastProps): ReactElement {
  const { t } = useTranslation('toast');

  return (
    <div className={`toast toast--${kind}`} role="status">
      <p className="toast__message">{message}</p>
      <button
        type="button"
        className="toast__dismiss"
        onClick={onDismiss}
        aria-label={t('dismiss-button-label')}
      >
        ×
      </button>
    </div>
  );
}
