import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Toast } from './Toast';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Toast, Given:a kind and message', () => {
  it('should render the message with the matching kind class', () => {
    render(<Toast kind="success" message="Saved" onDismiss={vi.fn()} />);

    const toast = screen.getByRole('status');
    expect(toast).toHaveClass('toast--success');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});

describe('Toast, Given:the dismiss button is clicked', () => {
  it('should call onDismiss', () => {
    const onDismiss = vi.fn();
    render(<Toast kind="info" message="Note" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'toast.dismiss-button-label' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
