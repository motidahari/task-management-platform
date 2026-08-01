import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Button } from '../Button';
import { Modal } from './Modal';

function ModalTrigger(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open modal</Button>
      {isOpen && (
        <Modal title="Confirm" onClose={() => setIsOpen(false)}>
          <p>Are you sure you want to continue?</p>
        </Modal>
      )}
    </>
  );
}

const meta = {
  title: 'Shared/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    // The backdrop is fixed to the viewport, so the canvas needs the full
    // frame and the docs page needs its own iframe — an inline docs block
    // is only a couple of hundred pixels tall and crops the dialog.
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '420px' },
      description: {
        component:
          "The single active modal + backdrop — always mounted by `ModalHost`, never rendered directly by a feature. Traps focus and closes on Esc so keyboard users can't tab or escape the dialog into the page behind it.",
      },
    },
  },
  args: {
    title: 'Confirm',
    onClose: (): void => {},
    children: <p>Are you sure you want to continue?</p>,
  },
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OpenByDefault: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Mounted already open, exactly as `ModalHost` renders it — focus moves into the dialog, and Esc, the backdrop, and the close button all call `onClose`.',
      },
    },
  },
};

export const TriggeredFromButton: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A trigger button mounts and unmounts the modal, demonstrating the full open/close cycle the way a feature view drives it.',
      },
    },
  },
  render: (): ReactElement => <ModalTrigger />,
};
