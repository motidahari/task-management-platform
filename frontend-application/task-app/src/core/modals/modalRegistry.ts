import type { ReactElement } from 'react';

import { CreateTaskModal } from '../../features/tasks/components/CreateTaskModal';
import { ConfirmModal } from '../../shared/components/Modal';
import type { ModalPropsMap } from '../bus/types';

export type ModalRegistryEntry<TModalId extends keyof ModalPropsMap> = (
  props: ModalPropsMap[TModalId] & { readonly onClose: () => void },
) => ReactElement;

export type ModalRegistry = {
  [TModalId in keyof ModalPropsMap]: ModalRegistryEntry<TModalId>;
};

/**
 * Which content component each modal id renders. Composition, not design
 * system: it names concrete feature screens, so it lives here rather than in
 * `ModalHost` — the host stays a generic overlay slot with no knowledge of
 * any feature. The mapped type keeps this registry and `ModalPropsMap`
 * provably in sync; a new id fails to compile until it is registered.
 */
export const MODAL_REGISTRY: ModalRegistry = {
  confirm: ConfirmModal,
  'create-task': CreateTaskModal,
};
