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
          'The only elevated surface in the app — `TaskCard`/detail panels compose this instead of a raw `<div>`.',
      },
    },
  },
  args: {
    children: 'Card content',
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithComposedContent: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A card composing heading, body text, and a `Badge`, mirroring how `TaskCard` lays out its content.',
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
