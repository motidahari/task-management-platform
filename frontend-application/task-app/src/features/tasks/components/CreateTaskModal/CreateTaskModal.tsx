import type { ReactElement } from 'react';

import { Modal } from '../../../../shared/components/Modal';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import { CreateTaskForm } from '../CreateTaskForm';

// `ModalPropsMap['create-task']` is `Record<string, never>` — it carries no
// props of its own, so it is deliberately not intersected in here (doing so
// would force `onClose` itself to `never`, since an index signature of
// `never` applies to every property, including ones a peer type adds).
export interface CreateTaskModalProps {
  readonly onClose: () => void;
}

/**
 * The `create-task` modal id's content, registered in `ModalHost`. Supplies
 * only the dialog chrome — `CreateTaskForm` keeps its own store calls,
 * validation and success handling, and closes this modal itself once a
 * submission succeeds.
 */
export function CreateTaskModal({ onClose }: CreateTaskModalProps): ReactElement {
  const { t } = useTranslation('create-task-form');

  return (
    <Modal title={t('title')} onClose={onClose}>
      <CreateTaskForm />
    </Modal>
  );
}
