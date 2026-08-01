import type { Meta, StoryObj } from '@storybook/react-vite';

import { ConfirmModal } from './ConfirmModal';

const meta = {
  title: 'Shared/ConfirmModal',
  component: ConfirmModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The generic yes/no confirmation dialog — registered under the `confirm` modal id. Every piece of copy is a prop supplied by the caller (already translated in its own scope), so this component owns no text of its own.',
      },
    },
  },
  args: {
    title: 'Close this task?',
    message: "This can't be undone. The task will be marked closed.",
    confirmLabel: 'Close task',
    cancelLabel: 'Cancel',
    onConfirm: (): void => {},
    onClose: (): void => {},
  },
} satisfies Meta<typeof ConfirmModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DestructiveConfirmation: Story = {
  parameters: {
    docs: {
      description: {
        story: 'An irreversible action, using the `danger` confirm button variant.',
      },
    },
  },
};

export const NeutralConfirmation: Story = {
  args: {
    title: 'Leave this page?',
    message: 'You have no unsaved changes.',
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
  },
  parameters: {
    docs: {
      description: {
        story: 'A reversible, low-stakes confirmation — the copy carries no destructive framing.',
      },
    },
  },
};
