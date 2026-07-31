import { create } from 'zustand';

export type Theme = 'dark' | 'light';

export interface ThemeStoreState {
  readonly theme: Theme;
  toggle: () => void;
}

const STORAGE_KEY = 'task-app-theme';
const DARK_THEME: Theme = 'dark';
const LIGHT_THEME: Theme = 'light';

function isTheme(value: string | null): value is Theme {
  return value === DARK_THEME || value === LIGHT_THEME;
}

function readStoredTheme(): Theme | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : null;
}

function readPreferredTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT_THEME : DARK_THEME;
}

/** The single place `<html data-theme>` is written, so every reader (CSS, this store) stays in sync. */
function stampDocumentTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? readPreferredTheme();
}

const initialTheme = resolveInitialTheme();
stampDocumentTheme(initialTheme);

/**
 * Runtime dark/light theme, persisted across visits: `localStorage` wins
 * when the user has picked explicitly, `prefers-color-scheme` decides the
 * first visit. `toggle` is the only way to change it, so persistence and the
 * `data-theme` stamp on `<html>` (what every CSS custom property in
 * `_themes.scss` keys off) can never drift from the state here.
 */
export const useThemeStore = create<ThemeStoreState>()((set, get) => ({
  theme: initialTheme,

  toggle: (): void => {
    const nextTheme: Theme = get().theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    stampDocumentTheme(nextTheme);
    set({ theme: nextTheme });
  },
}));
