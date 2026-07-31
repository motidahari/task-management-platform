import type { ReactElement } from 'react';

import type { ModalPropsMap } from '../../../core/bus/types';
import { Button } from '../Button';
import { Modal } from './Modal';
import './ConfirmModal.scss';

export type ConfirmModalProps = ModalPropsMap['confirm'] & { readonly onClose: () => void };

/**
 * The generic yes/no confirmation dialog — registered under the `confirm`
 * modal id. Every piece of copy is a prop supplied by the caller (already
 * translated in its own scope), so this component owns no text of its own.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: ConfirmModalProps): ReactElement {
  function handleConfirm(): void {
    onConfirm();
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-modal__message">{message}</p>
      <div className="confirm-modal__actions">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
