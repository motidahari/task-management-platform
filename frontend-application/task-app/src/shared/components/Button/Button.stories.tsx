import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button';

const meta = {
  title: 'Shared/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The only clickable action element in the app — every form/action button composes this instead of a raw `<button>`.',
      },
    },
  },
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'danger', 'ghost'],
    },
    type: {
      control: { type: 'select' },
      options: ['button', 'submit'],
    },
  },
  args: {
    children: 'Save',
    onClick: (): void => {},
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Delete',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Cancel',
  },
};

export const WithIcon: Story = {
  args: {
    icon: 'plus',
  },
  parameters: {
    docs: {
      description: {
        story: 'A named `Icon` rendered before the label — Button owns its sizing.',
      },
    },
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disables the button, swaps in a `Spinner`, and exposes `aria-busy` plus a visually hidden loading label.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
