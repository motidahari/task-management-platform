import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Replaces a bare empty/prompt paragraph wherever a list, gate or panel has nothing to show.',
      },
    },
  },
  args: {
    icon: 'inbox',
    title: 'No tasks yet',
  },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    description: 'Create your first task to get started.',
  },
};

export const WithAction: Story = {
  args: {
    description: 'Create your first task to get started.',
    action: <Button variant="primary">Create task</Button>,
  },
};

export const AtFinalStatus: Story = {
  parameters: {
    docs: {
      description: {
        story: 'As it appears once a task has no further status to advance into.',
      },
    },
  },
  args: {
    icon: 'check',
    title: 'Ready to close',
    description: 'This task has reached its final status.',
  },
};
