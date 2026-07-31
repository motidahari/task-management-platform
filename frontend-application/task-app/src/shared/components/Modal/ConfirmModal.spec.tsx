import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmModal } from './ConfirmModal';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('ConfirmModal, Given:it is rendered with caller-supplied copy', () => {
  it('should render the title, message and both action labels as given', () => {
    render(
      <ConfirmModal
        title="Close task"
        message="This cannot be undone."
        confirmLabel="Close"
        cancelLabel="Keep open"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Close task' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep open' })).toBeInTheDocument();
  });
});

describe('ConfirmModal, Given:the confirm action is clicked', () => {
  it('should call onConfirm then onClose', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        title="Close task"
        message="This cannot be undone."
        confirmLabel="Close"
        cancelLabel="Keep open"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmModal, Given:the cancel action is clicked', () => {
  it('should call onClose without calling onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmModal
        title="Close task"
        message="This cannot be undone."
        confirmLabel="Close"
        cancelLabel="Keep open"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
