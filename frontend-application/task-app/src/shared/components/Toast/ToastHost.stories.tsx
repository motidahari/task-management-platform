import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import type { ToastShowEvent } from '../../../core/bus/types';
import { useBus } from '../../../core/bus/useBus';
import { Button } from '../Button';
import { ToastHost } from './ToastHost';

interface ToastTriggerDemoProps {
  readonly buttonLabel: string;
  readonly event: ToastShowEvent;
}

function ToastTriggerDemo({ buttonLabel, event }: ToastTriggerDemoProps): ReactElement {
  const { emit } = useBus();

  return (
    <>
      <Button onClick={() => emit('toast:show', event)}>{buttonLabel}</Button>
      <ToastHost />
    </>
  );
}

const meta = {
  title: 'Shared/ToastHost',
  component: ToastHost,
  tags: ['autodocs'],
  parameters: {
    // The stack is pinned to the viewport corner, so it only lands where a
    // reader expects it when the story owns the whole frame.
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '260px' },
      description: {
        component:
          'Global, layout-level toast stack — mounted exactly once by `AppLayout`. Every feature reaches it only through the `toast:show` bus event (the `useToast` sugar, or a direct emit for pre-resolved error text); nothing ever renders a `Toast` itself. Copy travels either as a translation key (resolved here) or as already-resolved text.',
      },
    },
  },
} satisfies Meta<typeof ToastHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Renders an empty, non-visual stack until a `toast:show` event arrives.',
      },
    },
  },
};

export const SuccessFromBus: Story = {
  render: (): ReactElement => (
    <ToastTriggerDemo
      buttonLabel="Show success toast"
      event={{ kind: 'success', text: 'Task created.' }}
    />
  ),
};

export const ErrorFromBus: Story = {
  render: (): ReactElement => (
    <ToastTriggerDemo
      buttonLabel="Show error toast"
      event={{
        kind: 'error',
        text: "We couldn't reach the server. Check your connection and try again.",
      }}
    />
  ),
};

export const InfoFromBus: Story = {
  render: (): ReactElement => (
    <ToastTriggerDemo buttonLabel="Show info toast" event={{ kind: 'info', text: 'Heads up.' }} />
  ),
};

export const FromMessageKey: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The `messageKey` payload shape carries a translation key instead of resolved text — `ToastHost` translates it itself at render, since a global host has no single feature scope of its own.',
      },
    },
  },
  render: (): ReactElement => (
    <ToastTriggerDemo
      buttonLabel="Show toast from message key"
      event={{ kind: 'success', messageKey: 'task-lifecycle.closed-toast' }}
    />
  ),
};
