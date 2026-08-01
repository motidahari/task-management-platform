import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { Badge } from './Badge';

const meta = {
  title: 'Shared/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The only status/closed indicator in the app — the task table and detail view compose this instead of ad-hoc styled text.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['neutral', 'success', 'warning', 'danger', 'info'],
    },
    tone: {
      control: { type: 'select' },
      options: ['soft', 'solid'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md'],
    },
  },
  args: {
    children: 'Open',
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  args: {
    variant: 'neutral',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Done',
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'Pending',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Closed',
  },
};

export const Info: Story = {
  args: {
    variant: 'info',
    children: 'In review',
  },
};

export const AllVariants: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Every variant side by side, as they appear across status indicators in the app.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      <Badge variant="neutral">Neutral</Badge> <Badge variant="success">Success</Badge>{' '}
      <Badge variant="warning">Warning</Badge> <Badge variant="danger">Danger</Badge>{' '}
      <Badge variant="info">Info</Badge>
    </>
  ),
};

export const SoftTone: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The `soft` tone pairs a tinted background with its own text color, for a lower-emphasis status indicator.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      <Badge variant="success" tone="soft">
        Success
      </Badge>{' '}
      <Badge variant="warning" tone="soft">
        Warning
      </Badge>{' '}
      <Badge variant="danger" tone="soft">
        Danger
      </Badge>
    </>
  ),
};

export const SizeComparison: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The `sm` (default) and `md` sizes side by side.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      <Badge size="sm">Small</Badge> <Badge size="md">Medium</Badge>
    </>
  ),
};
