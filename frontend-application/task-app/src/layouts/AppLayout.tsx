import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { MODAL_REGISTRY } from '../core/modals/modalRegistry';
import { ModalHost } from '../shared/components/Modal';
import { ThemeToggle } from '../shared/components/ThemeToggle';
import { ToastHost } from '../shared/components/Toast';
import { useTranslation } from '../shared/hooks/useTranslation';
import './AppLayout.scss';

/**
 * The one place routed views mount, and the one place the global overlays
 * live: `ToastHost`/`ModalHost` render here exactly once, so every feature
 * reaches them only through the bus — never by importing `Toast`/`Modal`
 * directly.
 */
export function AppLayout(): ReactElement {
  const { t } = useTranslation('app-layout');

  return (
    <div className="app-layout">
      <header className="app-layout__header">
        <span className="app-layout__wordmark">{t('title')}</span>
        <ThemeToggle />
      </header>
      <main className="app-layout__content">
        <div className="app-layout__container">
          <Outlet />
        </div>
      </main>
      <ToastHost />
      <ModalHost registry={MODAL_REGISTRY} />
    </div>
  );
}
