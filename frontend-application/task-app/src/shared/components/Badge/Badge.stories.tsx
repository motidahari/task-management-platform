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
          'The only status/closed indicator in the app — `TaskCard`/`StatusStepper` compose this instead of ad-hoc styled text.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['neutral', 'success', 'warning', 'danger', 'info'],
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
