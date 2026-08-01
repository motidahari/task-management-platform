import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { useBus } from '../../../core/bus/useBus';
import { Button } from '../Button';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { ModalHost, type ModalHostProps } from './ModalHost';

// Stands in for the app's own registry so the catalogue entry stays free of
// feature screens.
const storyRegistry: ModalHostProps['registry'] = {
  confirm: ConfirmModal,
  'create-task': ({ onClose }) => (
    <Modal title="Create task" onClose={onClose}>
      <p>The feature supplies this content in the running app.</p>
    </Modal>
  ),
};

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

  function openCreateTaskModal(): void {
    emit('modal:open', { id: 'create-task', props: {} });
  }

  return (
    <>
      <Button onClick={openConfirmModal}>Open confirm modal</Button>
      <Button variant="secondary" onClick={openCreateTaskModal}>
        Open create-task modal
      </Button>
      <ModalHost registry={storyRegistry} />
    </>
  );
}

const meta = {
  title: 'Shared/ModalHost',
  component: ModalHost,
  tags: ['autodocs'],
  parameters: {
    // Renders `Modal` once an event arrives, so the story needs the same
    // full-frame canvas and its own docs iframe.
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '420px' },
      description: {
        component:
          'The single active modal, global to the app and mounted exactly once by `AppLayout`. No feature ever renders a modal directly — it emits `modal:open` with a registered id and typed props, and this host looks up the matching content component in the registry the app hands it.',
      },
    },
  },
  args: {
    registry: storyRegistry,
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
