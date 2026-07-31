import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation as useI18nTranslation } from 'react-i18next';

import type { ToastShowEvent } from '../../../core/bus/types';
import { useBus } from '../../../core/bus/useBus';
import { Toast } from './Toast';
import './ToastHost.scss';

const AUTO_DISMISS_MS = 5000;

interface ActiveToast {
  readonly id: string;
  readonly kind: ToastShowEvent['kind'];
  readonly message: string;
}

function resolveMessage(event: ToastShowEvent, translate: TFunction): string {
  return 'text' in event ? event.text : translate(event.messageKey, event.params);
}

/**
 * Global, layout-level toast stack — mounted exactly once by `AppLayout`.
 * Every feature reaches it only through `toast:show` on the bus (`useToast`
 * sugar or a direct emit for pre-resolved error text); nothing ever renders
 * a `<Toast>` itself. Copy travels either as a translation key (resolved
 * here, since a global host has no single feature scope of its own) or as
 * already-resolved text.
 */
export function ToastHost(): ReactElement {
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const { on } = useBus();
  const { t } = useI18nTranslation();

  const dismiss = useCallback((id: string): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    on('toast:show', (event) => {
      const id = crypto.randomUUID();
      setToasts((current) => [
        ...current,
        { id, kind: event.kind, message: resolveMessage(event, t) },
      ]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    });
  }, [on, t, dismiss]);

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}
