import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StepperStep } from './Stepper';
import { Stepper } from './Stepper';

const steps: readonly StepperStep[] = [
  { id: 'requested', label: 'Requested', state: 'done' },
  { id: 'approved', label: 'Approved', state: 'done' },
  { id: 'ordered', label: 'Ordered', state: 'current' },
  { id: 'received', label: 'Received', state: 'upcoming' },
];

const meta = {
  title: 'Shared/Stepper',
  component: Stepper,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A generic, presentational sequence of numbered steps — knows nothing about tasks or any other domain. Numbered circles join with a connector line; `done` shows a check, and the `current` item carries `aria-current="step"`.',
      },
    },
  },
  args: {
    steps,
    ariaLabel: 'Status',
  },
} satisfies Meta<typeof Stepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {};

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
};

export const AllUpcoming: Story = {
  args: {
    steps: steps.map((step, index) => ({ ...step, state: index === 0 ? 'current' : 'upcoming' })),
  },
};

export const AllDone: Story = {
  args: {
    steps: steps.map((step) => ({ ...step, state: 'done' })),
  },
};
