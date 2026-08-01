import { describe, expect, it, vi } from 'vitest';

import { cycleFocusWithinDialog, FOCUSABLE_SELECTOR } from './focusTrap';

function buildDialog(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.innerHTML = `
    <button>First</button>
    <button>Middle</button>
    <button>Last</button>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

describe('cycleFocusWithinDialog', () => {
  describe('Given:a non-Tab key', () => {
    it('should do nothing', () => {
      const dialog = buildDialog();
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      cycleFocusWithinDialog(event, dialog);

      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('Given:Tab is pressed on the last focusable element', () => {
    it('should wrap focus to the first focusable element', () => {
      const dialog = buildDialog();
      const buttons = dialog.querySelectorAll('button');
      const first = buttons[0] as HTMLElement;
      const last = buttons[2] as HTMLElement;
      last.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      cycleFocusWithinDialog(event, dialog);

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(first);
    });
  });

  describe('Given:Shift+Tab is pressed on the first focusable element', () => {
    it('should wrap focus to the last focusable element', () => {
      const dialog = buildDialog();
      const buttons = dialog.querySelectorAll('button');
      const first = buttons[0] as HTMLElement;
      const last = buttons[2] as HTMLElement;
      first.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      cycleFocusWithinDialog(event, dialog);

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(last);
    });
  });

  describe('Given:Tab is pressed on a focusable element that is neither first nor last', () => {
    it('should leave focus where it is', () => {
      const dialog = buildDialog();
      const buttons = dialog.querySelectorAll('button');
      const middle = buttons[1] as HTMLElement;
      middle.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      cycleFocusWithinDialog(event, dialog);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(middle);
    });
  });

  describe('Given:a dialog with no focusable elements', () => {
    it('should do nothing', () => {
      const dialog = document.createElement('div');
      document.body.appendChild(dialog);
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefault = vi.spyOn(event, 'preventDefault');

      cycleFocusWithinDialog(event, dialog);

      expect(preventDefault).not.toHaveBeenCalled();
    });
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  describe('Given:a dialog holding one of every candidate element', () => {
    it('should match every focusable element and skip a negative tabindex', () => {
      const dialog = buildDialog();
      dialog.innerHTML += `
        <a href="/">Link</a>
        <input />
        <select></select>
        <textarea></textarea>
        <div tabindex="0">Focusable div</div>
        <div tabindex="-1">Not focusable</div>
      `;

      const matches = dialog.querySelectorAll(FOCUSABLE_SELECTOR);

      expect(matches).toHaveLength(8);
    });
  });
});
