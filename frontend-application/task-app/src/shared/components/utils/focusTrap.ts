export const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps `Tab`/`Shift+Tab` cycling inside `dialog` instead of escaping into the
 * page behind it — the shared behaviour `Modal` and `Drawer` both need.
 */
export function cycleFocusWithinDialog(event: KeyboardEvent, dialog: HTMLElement): void {
  if (event.key !== 'Tab') return;

  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
