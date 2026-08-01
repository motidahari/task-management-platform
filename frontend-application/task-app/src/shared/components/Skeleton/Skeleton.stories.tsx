import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './Skeleton';

const meta = {
  title: 'Shared/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Shimmering placeholder shown instead of a bare `Spinner` on initial list and drawer loads. The shimmer is disabled under `prefers-reduced-motion`.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['text', 'block', 'circle'],
    },
    count: {
      control: { type: 'number' },
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Text: Story = {
  args: {
    variant: 'text',
  },
};

export const MultipleTextLines: Story = {
  args: {
    variant: 'text',
    count: 3,
  },
};

export const Block: Story = {
  args: {
    variant: 'block',
  },
};

export const Circle: Story = {
  args: {
    variant: 'circle',
  },
};

export const CustomSize: Story = {
  args: {
    variant: 'block',
    width: 240,
    height: 80,
  },
};
