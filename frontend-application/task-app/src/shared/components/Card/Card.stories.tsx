import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { Badge } from '../Badge';
import { Card } from './Card';

const meta = {
  title: 'Shared/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The only elevated surface in the app — the user gate and other detail panels compose this instead of a raw `<div>`.',
      },
    },
  },
  argTypes: {
    padding: {
      control: { type: 'select' },
      options: ['none', 'sm', 'md'],
    },
    elevation: {
      control: { type: 'select' },
      options: ['flat', 'raised'],
    },
  },
  args: {
    children: 'Card content',
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoPadding: Story = {
  args: {
    padding: 'none',
  },
};

export const SmallPadding: Story = {
  args: {
    padding: 'sm',
  },
};

export const Raised: Story = {
  args: {
    elevation: 'raised',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Adds `--shadow-md` on top of the resting border, for a surface that sits above the page.',
      },
    },
  },
};

export const WithComposedContent: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A card composing heading, body text, and a `Badge`, the shape a detail panel lays its content out in.',
      },
    },
  },
  render: (): ReactElement => (
    <Card>
      <h3>Design the onboarding flow</h3>
      <p>Draft the wireframes for the new user onboarding experience.</p>
      <Badge variant="info">In review</Badge>
    </Card>
  ),
};
