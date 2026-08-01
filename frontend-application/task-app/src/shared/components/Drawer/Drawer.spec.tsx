import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Drawer } from './Drawer';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

describe('Drawer', () => {
  let onClose: Mock<() => void>;

  const renderDrawer = (
    children: ReactNode = 'content',
    props: Partial<ComponentProps<typeof Drawer>> = {},
  ): ReturnType<typeof render> =>
    render(
      <Drawer title="Task details" onClose={onClose} {...props}>
        {children}
      </Drawer>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Given:it is rendered', () => {
    it('should render the title and children inside a labelled dialog', () => {
      renderDrawer(<p>Task fields</p>);

      const dialog = screen.getByRole('dialog', { name: 'Task details' });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Task fields')).toBeInTheDocument();
    });

    it('should default to the lg width variant', () => {
      renderDrawer();

      expect(screen.getByRole('dialog')).toHaveClass('drawer--lg');
    });
  });

  describe('Given:a width prop', () => {
    it('should apply the matching width variant class', () => {
      renderDrawer('content', { width: 'md' });

      expect(screen.getByRole('dialog')).toHaveClass('drawer--md');
    });
  });

  describe('Given:a footer prop', () => {
    it('should render it below the body', () => {
      renderDrawer('content', { footer: <button type="button">Save</button> });

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });
  });

  describe('Given:no footer prop', () => {
    it('should not render a footer region', () => {
      const { container } = renderDrawer();

      expect(container.querySelector('.drawer__footer')).not.toBeInTheDocument();
    });
  });

  describe('Given:the close button is clicked', () => {
    it('should call onClose', () => {
      renderDrawer();

      fireEvent.click(screen.getByRole('button', { name: 'drawer.close-button-label' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a click on the backdrop', () => {
    it('should call onClose', () => {
      renderDrawer();

      fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:a click inside the dialog body', () => {
    it('should not call onClose', () => {
      renderDrawer(<p>content</p>);

      fireEvent.click(screen.getByText('content'));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Given:the Escape key is pressed', () => {
    it('should call onClose', () => {
      renderDrawer();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:it is mounted', () => {
    it('should lock body scroll and restore it on unmount', () => {
      const { unmount } = renderDrawer();

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Given:a testId prop', () => {
    it('should apply it as data-testid on the dialog', () => {
      renderDrawer('content', { testId: 'task-detail-drawer' });

      expect(screen.getByTestId('task-detail-drawer')).toBe(screen.getByRole('dialog'));
    });
  });
});
