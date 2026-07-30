import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ThemeStoreState } from '../../stores/useThemeStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { ThemeToggle } from './ThemeToggle';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../../stores/useThemeStore', () => ({
  useThemeStore: vi.fn(),
}));

const mockedUseThemeStore = vi.mocked(useThemeStore);

function mockStoreState(overrides: ThemeStoreState): ReturnType<typeof vi.fn> {
  mockedUseThemeStore.mockImplementation((selector: (state: ThemeStoreState) => unknown) =>
    selector(overrides),
  );
  return overrides.toggle as ReturnType<typeof vi.fn>;
}

describe('ThemeToggle, Given:the current theme is dark', () => {
  it('should show the dark-mode label and offer to switch to light', () => {
    mockStoreState({ theme: 'dark', toggle: vi.fn() });

    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: 'theme-toggle.switch-to-light-label' });
    expect(button).toHaveTextContent('theme-toggle.dark-mode-label');
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ThemeToggle, Given:the current theme is light', () => {
  it('should show the light-mode label and offer to switch to dark', () => {
    mockStoreState({ theme: 'light', toggle: vi.fn() });

    render(<ThemeToggle />);

    const button = screen.getByRole('button', { name: 'theme-toggle.switch-to-dark-label' });
    expect(button).toHaveTextContent('theme-toggle.light-mode-label');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('ThemeToggle, Given:a click from the user', () => {
  it('should call the store toggle action', () => {
    const toggle = mockStoreState({ theme: 'dark', toggle: vi.fn() });

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));

    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
