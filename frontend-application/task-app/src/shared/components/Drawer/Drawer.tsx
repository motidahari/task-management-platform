import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import { Icon } from '../Icon';
import { cycleFocusWithinDialog } from '../utils/focusTrap';
import './Drawer.scss';

export type DrawerWidth = 'md' | 'lg';

export interface DrawerProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: DrawerWidth;
  readonly testId?: string;
}

/**
 * The single right-anchored overlay panel — shares Modal's focus trap and Esc
 * handling via `focusTrap`, and additionally locks page scroll while it is
 * mounted so the list behind it can't scroll underneath the panel.
 */
export function Drawer({
  title,
  onClose,
  children,
  footer,
  width = 'lg',
  testId,
}: DrawerProps): ReactElement {
  const { t } = useTranslation('drawer');
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="drawer__backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`drawer drawer--${width}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <button
            type="button"
            className="drawer__close"
            onClick={onClose}
            aria-label={t('close-button-label')}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__footer">{footer}</div>}
      </div>
    </div>
  );
}
