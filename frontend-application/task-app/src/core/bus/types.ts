/**
 * Modal ids and their props are a closed, typed map — opening an unknown id
 * or passing the wrong props shape is a compile error, not a blank modal at
 * runtime. Every new modal adds one entry here and the compiler keeps this
 * registry and `ModalHost`'s rendering registry provably in sync.
 */
export interface ModalPropsMap {
  readonly confirm: {
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
    readonly onConfirm: () => void;
  };
}

export type ModalOpenEvent = {
  [TModalId in keyof ModalPropsMap]: {
    readonly id: TModalId;
    readonly props: ModalPropsMap[TModalId];
  };
}[keyof ModalPropsMap];

export type ToastKind = 'success' | 'error' | 'info';

/**
 * Exactly one of `messageKey` (client-authored copy, resolved by `ToastHost`
 * at render) or `text` (already-resolved display string, e.g. from mapping a
 * server error code) — never both, so the payload stays a plain serializable
 * value regardless of which path produced it.
 */
export type ToastShowEvent = { readonly kind: ToastKind } & (
  | { readonly messageKey: string; readonly params?: Record<string, unknown> }
  | { readonly text: string }
);

export interface BusEvents {
  'toast:show': ToastShowEvent;
  'modal:open': ModalOpenEvent;
  'modal:close': void;
  // Socket gap ended — mounted views re-fetch to close any window they missed.
  'realtime:reconnected': void;
}

export type BusHandler<TPayload> = (payload: TPayload) => void;
