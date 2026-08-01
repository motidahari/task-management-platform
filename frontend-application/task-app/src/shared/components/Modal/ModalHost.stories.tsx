import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { useBus } from '../../../core/bus/useBus';
import { Button } from '../Button';
import { ModalHost } from './ModalHost';

function ModalHostDemo(): ReactElement {
  const { emit } = useBus();

  function openConfirmModal(): void {
    emit('modal:open', {
      id: 'confirm',
      props: {
        title: 'Close this task?',
        message: "This can't be undone. The task will be marked closed.",
        confirmLabel: 'Close task',
        cancelLabel: 'Cancel',
        onConfirm: (): void => {},
      },
    });
  }

  return (
    <>
      <Button onClick={openConfirmModal}>Open confirm modal</Button>
      <ModalHost />
    </>
  );
}

const meta = {
  title: 'Shared/ModalHost',
  component: ModalHost,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The single active modal, global to the app and mounted exactly once by `AppLayout`. No feature ever renders a modal directly — it emits `modal:open` with a registered id and typed props, and this host looks up the matching content component from `MODAL_REGISTRY`.',
      },
    },
  },
} satisfies Meta<typeof ModalHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Renders nothing until a `modal:open` event arrives on the bus.',
      },
    },
  },
};

export const OpenedFromBus: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The trigger button emits `modal:open` with the `confirm` id and its typed props, exactly as a feature view would — the host looks up `ConfirmModal` from its registry and mounts it.',
      },
    },
  },
  render: (): ReactElement => <ModalHostDemo />,
};
