import { useEffect, type ReactElement, type ReactNode } from 'react';

import { useTranslation } from '../../../../shared/hooks/useTranslation';
import { useTaskTypeStore } from '../../stores/useTaskTypeStore';

export interface TaskTypesGateProps {
  readonly children: ReactNode;
}

/**
 * Blocks rendering on the task-type metadata load: every dynamic form,
 * stepper, and label derives from it, so letting routes render before it
 * resolves would surface a screen of broken widgets instead of the one real
 * failure. Shows a placeholder spinner while loading and a full-screen retry
 * state if every automatic attempt failed; the retry button re-runs the load.
 *
 * The loading and retry markup is intentionally minimal: the shared
 * design-system `Spinner`/`Button` are not part of this app yet, so this
 * renders plain elements rather than depending on components that don't exist.
 */
export function TaskTypesGate({ children }: TaskTypesGateProps): ReactElement {
  const { t } = useTranslation('task-types-gate');
  const status = useTaskTypeStore((state) => state.status);
  const loadTaskTypes = useTaskTypeStore((state) => state.loadTaskTypes);

  useEffect(() => {
    if (status === 'idle') {
      void loadTaskTypes();
    }
  }, [status, loadTaskTypes]);

  if (status === 'error') {
    return (
      <div className="task-types-gate task-types-gate--error" role="alert">
        <p className="task-types-gate__message">{t('error-message')}</p>
        <button
          type="button"
          className="task-types-gate__retry"
          onClick={() => void loadTaskTypes()}
        >
          {t('retry-button')}
        </button>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div className="task-types-gate task-types-gate--loading" role="status" aria-live="polite">
        {t('loading')}
      </div>
    );
  }

  return <>{children}</>;
}
