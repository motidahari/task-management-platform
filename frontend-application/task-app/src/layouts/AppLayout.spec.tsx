import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from './AppLayout';

vi.mock('../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../shared/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('../shared/components/Toast', () => ({
  ToastHost: () => <div data-testid="toast-host" />,
}));

vi.mock('../shared/components/Modal', () => ({
  ModalHost: () => <div data-testid="modal-host" />,
}));

describe('AppLayout', () => {
  function renderAppLayout(): ReturnType<typeof render> {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<div>routed content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:a routed child', () => {
    it('should render the header, the routed outlet content, and both global overlay hosts', () => {
      renderAppLayout();

      expect(screen.getByText('app-layout.title')).toBeInTheDocument();
      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
      expect(screen.getByText('routed content')).toBeInTheDocument();
      expect(screen.getByTestId('toast-host')).toBeInTheDocument();
      expect(screen.getByTestId('modal-host')).toBeInTheDocument();
    });
  });
});
