import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bus } from '../../../core/bus/bus';
import { ModalHost } from './ModalHost';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('ModalHost', () => {
  const openConfirmModal = (): void => {
    act(() => {
      bus.emit('modal:open', {
        id: 'confirm',
        props: {
          title: 'Close task',
          message: 'This cannot be undone.',
          confirmLabel: 'Close',
          cancelLabel: 'Keep open',
          onConfirm: vi.fn(),
        },
      });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:no modal has been opened', () => {
    it('should render nothing', () => {
      const { container } = render(<ModalHost />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Given:a modal:open event for a registered id', () => {
    it('should render that modal with the emitted props', () => {
      render(<ModalHost />);

      openConfirmModal();

      expect(screen.getByRole('dialog', { name: 'Close task' })).toBeInTheDocument();
    });
  });

  describe('Given:the open modal is dismissed via its own onClose', () => {
    it('should unmount it', () => {
      render(<ModalHost />);
      openConfirmModal();

      fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Given:a modal:close event while a modal is open', () => {
    it('should unmount the active modal', () => {
      render(<ModalHost />);
      openConfirmModal();

      act(() => {
        bus.emit('modal:close');
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
