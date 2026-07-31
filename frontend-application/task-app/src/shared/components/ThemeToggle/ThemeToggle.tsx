import type { ReactElement } from 'react';

import { useTranslation } from '../../hooks/useTranslation';
import { useThemeStore } from '../../stores/useThemeStore';
import './ThemeToggle.scss';

/** Flips `useThemeStore`'s persisted theme — the header's single entry point for switching dark/light. */
export function ThemeToggle(): ReactElement {
  const { t } = useTranslation('theme-toggle');
  const theme = useThemeStore((state) => state.theme);
  const toggle = useThemeStore((state) => state.toggle);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={t(isDark ? 'switch-to-light-label' : 'switch-to-dark-label')}
    >
      {isDark ? t('dark-mode-label') : t('light-mode-label')}
    </button>
  );
}
