import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { ModalOpenEvent, ModalPropsMap } from '../../../core/bus/types';
import { useBus } from '../../../core/bus/useBus';
import { ConfirmModal } from './ConfirmModal';

type ModalRegistryEntry<TModalId extends keyof ModalPropsMap> = (
  props: ModalPropsMap[TModalId] & { readonly onClose: () => void },
) => ReactElement;

/** Every modal id in `ModalPropsMap` registers its content component here — the compiler enforces the two stay in sync. */
const MODAL_REGISTRY: { [TModalId in keyof ModalPropsMap]: ModalRegistryEntry<TModalId> } = {
  confirm: ConfirmModal,
};

/**
 * The single active modal, global to the app and mounted exactly once by
 * `AppLayout`. No feature ever renders a modal directly — it emits
 * `modal:open` with a registered id and typed props, and this host looks up
 * the matching content component from `MODAL_REGISTRY`.
 */
export function ModalHost(): ReactElement | null {
  const [activeModal, setActiveModal] = useState<ModalOpenEvent | null>(null);
  const { on } = useBus();

  const close = useCallback((): void => setActiveModal(null), []);

  useEffect(() => {
    on('modal:open', setActiveModal);
    on('modal:close', close);
  }, [on, close]);

  if (!activeModal) return null;

  const ModalContent = MODAL_REGISTRY[activeModal.id];

  return <ModalContent {...activeModal.props} onClose={close} />;
}
