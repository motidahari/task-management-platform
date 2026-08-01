import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { ModalOpenEvent, ModalPropsMap } from '../../../core/bus/types';
import { useBus } from '../../../core/bus/useBus';

type ModalContentComponent<TModalId extends keyof ModalPropsMap> = (
  props: ModalPropsMap[TModalId] & { readonly onClose: () => void },
) => ReactElement;

export interface ModalHostProps {
  /** Which content component each modal id renders — supplied by the app, so this host stays feature-agnostic. */
  readonly registry: { [TModalId in keyof ModalPropsMap]: ModalContentComponent<TModalId> };
}

/**
 * The single active modal, global to the app and mounted exactly once by
 * `AppLayout`. No feature ever renders a modal directly — it emits
 * `modal:open` with a registered id and typed props, and this host looks up
 * the matching content component in the registry it was given.
 */
export function ModalHost({ registry }: ModalHostProps): ReactElement | null {
  const [activeModal, setActiveModal] = useState<ModalOpenEvent | null>(null);
  const { on } = useBus();

  const close = useCallback((): void => setActiveModal(null), []);

  useEffect(() => {
    on('modal:open', setActiveModal);
    on('modal:close', close);
  }, [on, close]);

  if (!activeModal) return null;

  // `registry[activeModal.id]` is a union of per-id component types once the
  // registry has more than one entry, and TypeScript checks a call through a
  // union of function types against the intersection of their parameter
  // types — not the branch matching `activeModal.id`. The registry's own type
  // still keeps every id's component checked against its own props; this cast
  // only clears that one call-site limitation, and `activeModal.props` itself
  // stays fully typed to its id.
  const ModalContent = registry[activeModal.id] as (
    props: Record<string, unknown> & { readonly onClose: () => void },
  ) => ReactElement;

  return <ModalContent {...activeModal.props} onClose={close} />;
}
