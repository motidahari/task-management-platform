import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfigError } from './ConfigError';

vi.mock('../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('ConfigError', () => {
  const technicalDetail = 'VITE_API_URL is not set — copy .env.example to .env.local and set it.';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Given:any build', () => {
    it('should announce itself and render product copy rather than the raw failure', () => {
      render(<ConfigError message={technicalDetail} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('config-error.title')).toBeInTheDocument();
      expect(screen.getByText('config-error.message')).toBeInTheDocument();
    });
  });

  describe('Given:a development build', () => {
    it('should also render the technical detail', () => {
      vi.stubEnv('DEV', true);

      render(<ConfigError message={technicalDetail} />);

      expect(screen.getByText(technicalDetail)).toBeInTheDocument();
    });
  });

  describe('Given:a production build', () => {
    it('should keep the technical detail off the screen', () => {
      vi.stubEnv('DEV', false);

      render(<ConfigError message={technicalDetail} />);

      expect(screen.queryByText(technicalDetail)).not.toBeInTheDocument();
    });
  });
});
