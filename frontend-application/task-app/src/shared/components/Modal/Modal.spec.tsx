import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Modal, Given:it is rendered', () => {
  it('should render the title and children inside a labelled dialog', () => {
    render(
      <Modal title="Confirm" onClose={vi.fn()}>
        <p>Are you sure?</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });
});

describe('Modal, Given:the close button is clicked', () => {
  it('should call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirm" onClose={onClose}>
        content
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'modal.close-button-label' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal, Given:a click on the backdrop', () => {
  it('should call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirm" onClose={onClose}>
        content
      </Modal>,
    );

    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal, Given:a click inside the dialog body', () => {
  it('should not call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirm" onClose={onClose}>
        <p>content</p>
      </Modal>,
    );

    fireEvent.click(screen.getByText('content'));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Modal, Given:the Escape key is pressed', () => {
  it('should call onClose', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Confirm" onClose={onClose}>
        content
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
