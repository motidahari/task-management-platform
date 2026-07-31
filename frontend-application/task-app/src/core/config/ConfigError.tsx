import type { ReactElement } from 'react';

export interface ConfigErrorProps {
  readonly message: string;
}

/**
 * Fatal boot screen for a missing/invalid environment configuration. Rendered
 * by the entry point in place of the app when {@link configError} is set, so a
 * misconfigured build shows the actual problem instead of a blank page.
 *
 * The copy is intentionally not routed through i18n: this renders before the
 * app is usable and the message is a developer-facing setup instruction, not
 * end-user product text.
 */
export function ConfigError({ message }: ConfigErrorProps): ReactElement {
  return (
    <div className="config-error" role="alert">
      <h1 className="config-error__title">Configuration error</h1>
      <p className="config-error__message">{message}</p>
    </div>
  );
}
