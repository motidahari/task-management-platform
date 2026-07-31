import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Spinner } from './Spinner';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Spinner, Given:no size prop', () => {
  it('should render a status role with the medium size modifier', () => {
    render(<Spinner />);

    const status = screen.getByRole('status');
    expect(status).toHaveClass('spinner--md');
  });
});

describe('Spinner, Given:a size prop', () => {
  it('should apply the matching size modifier class', () => {
    render(<Spinner size="lg" />);

    expect(screen.getByRole('status')).toHaveClass('spinner--lg');
  });
});

describe('Spinner, Given:default rendering', () => {
  it('should expose an accessible loading label', () => {
    render(<Spinner />);

    expect(screen.getByText('spinner.loading-label')).toBeInTheDocument();
  });
});
