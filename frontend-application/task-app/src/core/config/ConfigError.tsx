import type { ReactElement } from 'react';

import { useTranslation } from '../../shared/hooks/useTranslation';

export interface ConfigErrorProps {
  readonly message: string;
}

/**
 * Fatal boot screen for a missing/invalid environment configuration,
 * rendered by the entry point in place of the app when {@link configError} is
 * set, so a misconfigured build shows something readable instead of a blank
 * page.
 *
 * What it shows depends on who can be looking. A production visitor gets
 * product copy only — the variable names and setup steps behind the failure
 * describe the deployment and are nothing they can act on. The
 * developer-facing detail stays in development builds, where it is the whole
 * point of the screen.
 */
export function ConfigError({ message }: ConfigErrorProps): ReactElement {
  const { t } = useTranslation('config-error');

  return (
    <div className="config-error" role="alert">
      <h1 className="config-error__title">{t('title')}</h1>
      <p className="config-error__message">{t('message')}</p>
      {import.meta.env.DEV && <p className="config-error__detail">{message}</p>}
    </div>
  );
}
