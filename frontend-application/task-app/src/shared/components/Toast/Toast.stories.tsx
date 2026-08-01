import type { Meta, StoryObj } from '@storybook/react-vite';

import { Toast } from './Toast';

const meta = {
  title: 'Shared/Toast',
  component: Toast,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A single stacked notification — `ToastHost` is the only place that renders one, always from a bus event.',
      },
    },
  },
  argTypes: {
    kind: {
      control: { type: 'select' },
      options: ['success', 'error', 'info'],
    },
  },
  args: {
    message: 'Task created.',
    onDismiss: (): void => {},
  },
} satisfies Meta<typeof Toast>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    kind: 'success',
    message: 'Task created.',
  },
};

export const Error: Story = {
  args: {
    kind: 'error',
    message: "We couldn't reach the server. Check your connection and try again.",
  },
};

export const Info: Story = {
  args: {
    kind: 'info',
    message: 'Heads up.',
  },
};
