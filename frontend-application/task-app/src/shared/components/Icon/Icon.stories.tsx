import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

import { Icon, type IconName } from './Icon';

const ICON_NAMES: readonly IconName[] = [
  'package',
  'wrench',
  'task',
  'chevron-down',
  'chevron-right',
  'close',
  'clock',
  'check',
  'plus',
  'user',
  'inbox',
  'alert',
];

const meta = {
  title: 'Shared/Icon',
  component: Icon,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'One inline stroke-icon set keyed by `IconName`; colour is inherited via `currentColor`.',
      },
    },
  },
  argTypes: {
    name: {
      control: { type: 'select' },
      options: ICON_NAMES,
    },
    size: {
      control: { type: 'number' },
    },
  },
  args: {
    name: 'check',
  },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAccessibleTitle: Story = {
  args: {
    name: 'alert',
    title: 'Warning',
  },
};

export const SizeScale: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The same icon rendered at a few sizes, as it appears inline vs. in an EmptyState.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      <Icon name="package" size={16} /> <Icon name="package" size={24} />{' '}
      <Icon name="package" size={32} /> <Icon name="package" size={48} />
    </>
  ),
};

export const AllIcons: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Every icon in the set, side by side.',
      },
    },
  },
  render: (): ReactElement => (
    <>
      {ICON_NAMES.map((name) => (
        <span key={name}>
          <Icon name={name} size={24} title={name} />{' '}
        </span>
      ))}
    </>
  ),
};
