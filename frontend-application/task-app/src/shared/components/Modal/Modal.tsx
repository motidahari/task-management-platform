import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import { Icon } from '../Icon';
import { cycleFocusWithinDialog } from '../utils/focusTrap';
import './Modal.scss';

export interface ModalProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * The single active modal + backdrop — always mounted by `ModalHost`, never
 * rendered directly by a feature. Traps focus and closes on Esc so keyboard
 * users can't tab or escape the dialog into the page behind it.
 */
export function Modal({ title, onClose, children }: ModalProps): ReactElement {
  const { t } = useTranslation('modal');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      const dialog = dialogRef.current;
      if (dialog) cycleFocusWithinDialog(event, dialog);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t('close-button-label')}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
