import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThemeToggle } from './ThemeToggle';

const meta = {
  title: 'Shared/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          "Flips `useThemeStore`'s persisted theme — the header's single entry point for switching dark/light. " +
          'It drives the real `useThemeStore`, so clicking it overrides the toolbar theme switcher above (and persists to `localStorage`).',
      },
    },
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
