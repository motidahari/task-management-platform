import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bus } from '../../../core/bus/bus';
import { ConfirmModal } from './ConfirmModal';
import { ModalHost, type ModalHostProps } from './ModalHost';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('ModalHost', () => {
  // A stand-in for whatever the app registers, so the host is exercised
  // without pulling a feature screen into a shared-component test.
  function CreateTaskModalStub({ onClose }: { readonly onClose: () => void }): ReactElement {
    return (
      <div data-testid="create-task-modal-stub">
        <button type="button" onClick={onClose}>
          stub close
        </button>
      </div>
    );
  }

  const registry: ModalHostProps['registry'] = {
    confirm: ConfirmModal,
    'create-task': CreateTaskModalStub,
  };

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
      const { container } = render(<ModalHost registry={registry} />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Given:a modal:open event for a registered id', () => {
    it('should render that modal with the emitted props', () => {
      render(<ModalHost registry={registry} />);

      openConfirmModal();

      expect(screen.getByRole('dialog', { name: 'Close task' })).toBeInTheDocument();
    });
  });

  describe('Given:the open modal is dismissed via its own onClose', () => {
    it('should unmount it', () => {
      render(<ModalHost registry={registry} />);
      openConfirmModal();

      fireEvent.click(screen.getByRole('button', { name: 'Keep open' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Given:a modal:close event while a modal is open', () => {
    it('should unmount the active modal', () => {
      render(<ModalHost registry={registry} />);
      openConfirmModal();

      act(() => {
        bus.emit('modal:close');
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Given:a modal:open event for a second registered id', () => {
    it('should render that id’s content instead of the first', () => {
      render(<ModalHost registry={registry} />);

      act(() => {
        bus.emit('modal:open', { id: 'create-task', props: {} });
      });

      expect(screen.getByTestId('create-task-modal-stub')).toBeInTheDocument();
    });
  });
});
