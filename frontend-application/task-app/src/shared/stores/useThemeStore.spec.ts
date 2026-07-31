import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'task-app-theme';

describe('useThemeStore', () => {
  // jsdom's own `localStorage` is shadowed by the Node runtime's built-in
  // global in this test environment, which resolves to a non-functional
  // stub — so the store's persistence is exercised against a real in-memory
  // `Storage` substitute instead, installed fresh before every case.
  function installFakeLocalStorage(): void {
    const backing = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => {
        backing.set(key, value);
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => {
        backing.clear();
      },
      key: (index: number) => Array.from(backing.keys())[index] ?? null,
      get length() {
        return backing.size;
      },
    };

    Object.defineProperty(window, 'localStorage', {
      value: fakeStorage,
      configurable: true,
      writable: true,
    });
  }

  function mockMatchMedia(prefersLight: boolean): void {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: prefersLight,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  beforeEach(() => {
    vi.resetModules();
    installFakeLocalStorage();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('Given:no theme stored yet and the OS prefers dark', () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it('should initialize to dark and stamp it on <html>', async () => {
      const { useThemeStore } = await import('./useThemeStore');

      expect(useThemeStore.getState().theme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('Given:no theme stored yet and the OS prefers light', () => {
    beforeEach(() => {
      mockMatchMedia(true);
    });

    it('should initialize to light', async () => {
      const { useThemeStore } = await import('./useThemeStore');

      expect(useThemeStore.getState().theme).toBe('light');
    });
  });

  describe('Given:a theme already stored from a previous visit', () => {
    beforeEach(() => {
      window.localStorage.setItem(STORAGE_KEY, 'light');
      // OS reports a preference for dark — the stored choice must still win.
      mockMatchMedia(false);
    });

    it('should initialize to the stored theme regardless of the OS preference', async () => {
      const { useThemeStore } = await import('./useThemeStore');

      expect(useThemeStore.getState().theme).toBe('light');
    });
  });

  describe('Given:toggle() called', () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it('should flip the theme, persist the choice, and re-stamp <html>', async () => {
      const { useThemeStore } = await import('./useThemeStore');

      useThemeStore.getState().toggle();

      expect(useThemeStore.getState().theme).toBe('light');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should flip back on a second call', async () => {
      const { useThemeStore } = await import('./useThemeStore');

      useThemeStore.getState().toggle();
      useThemeStore.getState().toggle();

      expect(useThemeStore.getState().theme).toBe('dark');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
