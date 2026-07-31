import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { ConfirmModal } from './ConfirmModal';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('ConfirmModal', () => {
  let onConfirm: Mock<() => void>;
  let onClose: Mock<() => void>;

  const renderConfirmModal = (): ReturnType<typeof render> =>
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

  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm = vi.fn();
    onClose = vi.fn();
  });

  describe('Given:it is rendered with caller-supplied copy', () => {
    it('should render the title, message and both action labels as given', () => {
      renderConfirmModal();

      expect(screen.getByRole('dialog', { name: 'Close task' })).toBeInTheDocument();
      expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep open' })).toBeInTheDocument();
    });
  });

  describe('Given:the confirm action is clicked', () => {
    it('should call onConfirm then onClose', () => {
      renderConfirmModal();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:the cancel action is clicked', () => {
    it('should call onClose without calling onConfirm', () => {
      renderConfirmModal();

      fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
