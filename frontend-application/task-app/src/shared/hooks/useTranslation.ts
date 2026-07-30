import { useTranslation as useI18nTranslation } from 'react-i18next';

export interface ScopedTranslation {
  readonly t: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * The only translation entry point components use — wraps react-i18next
 * behind a scoped surface so a component only ever writes its own short,
 * local keys and the library stays swappable.
 */
export function useTranslation(scope: string): ScopedTranslation {
  const { t } = useI18nTranslation();

  return {
    t: (key: string, params?: Record<string, unknown>) => t(`${scope}.${key}`, params),
  };
}
