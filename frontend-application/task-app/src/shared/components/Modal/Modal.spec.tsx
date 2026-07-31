import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Modal } from './Modal';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Modal', () => {
  let onClose: Mock<() => void>;

  const renderModal = (children: ReactNode = 'content'): ReturnType<typeof render> =>
    render(
      <Modal title="Confirm" onClose={onClose}>
        {children}
      </Modal>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
  });

  describe('Given:it is rendered', () => {
    it('should render the title and children inside a labelled dialog', () => {
      renderModal(<p>Are you sure?</p>);

      const dialog = screen.getByRole('dialog', { name: 'Confirm' });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    });
  });

  describe('Given:the close button is clicked', () => {
    it('should call onClose', () => {
      renderModal();

      fireEvent.click(screen.getByRole('button', { name: 'modal.close-button-label' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a click on the backdrop', () => {
    it('should call onClose', () => {
      renderModal();

      fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a click inside the dialog body', () => {
    it('should not call onClose', () => {
      renderModal(<p>content</p>);

      fireEvent.click(screen.getByText('content'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Given:the Escape key is pressed', () => {
    it('should call onClose', () => {
      renderModal();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
