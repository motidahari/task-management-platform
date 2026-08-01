import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { Avatar, AVATAR_COLORS } from './Avatar';

const meta = {
  title: 'Shared/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Single reusable avatar. The SVG uses `currentColor`, so the background is driven by the CSS `color` set here — no per-user file, one shape colored many ways.',
      },
    },
  },
  argTypes: {
    size: {
      control: { type: 'number' },
    },
    color: {
      control: { type: 'color' },
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Seeded: Story = {
  args: {
    seed: 'jane-doe',
  },
};

export const ExplicitColor: Story = {
  args: {
    color: AVATAR_COLORS[5],
  },
};

export const SizeScale: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The same avatar rendered at a few sizes, as it appears in compact vs. detail views.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      <Avatar seed="jane-doe" size={24} /> <Avatar seed="jane-doe" size={40} />{' '}
      <Avatar seed="jane-doe" size={64} /> <Avatar seed="jane-doe" size={96} />
    </>
  ),
};

export const PaletteOverview: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Every entry in `AVATAR_COLORS`, side by side.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      {AVATAR_COLORS.map((color) => (
        <span key={color}>
          <Avatar color={color} />{' '}
        </span>
      ))}
    </>
  ),
};
