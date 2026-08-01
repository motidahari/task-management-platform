import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Select, type SelectProps } from './Select';

function ControlledSelect(props: SelectProps): ReactElement {
  const [value, setValue] = useState(props.value);
  return <Select {...props} value={value} onChange={setValue} />;
}

const options = [
  { value: 'feature', label: 'Feature' },
  { value: 'bug', label: 'Bug' },
  { value: 'chore', label: 'Chore' },
];

const meta = {
  title: 'Shared/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    // The open listbox is anchored below the trigger and overflows the short,
    // scrollable block a docs page renders a story into, so the options end up
    // half-hidden; its own iframe gives the dropdown room to open in full.
    docs: {
      story: { inline: false, height: '320px' },
      description: {
        component:
          'The only dropdown in the app — `UserSelect`/task-type pickers compose this instead of a raw `<select>`. It renders its own listbox anchored below the trigger, following the ARIA combobox pattern: focus stays on the trigger button and the active option is tracked with `aria-activedescendant`.',
      },
    },
  },
  args: {
    id: 'type',
    label: 'Type',
    value: '',
    options,
    onChange: (): void => {},
  },
  render: (args): ReactElement => <ControlledSelect {...args} />,
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 'feature',
  },
};

export const WithPlaceholder: Story = {
  args: {
    value: '',
    placeholder: 'Choose a type',
  },
};

export const WithError: Story = {
  args: {
    value: '',
    errorText: 'This field is required.',
  },
};

export const Required: Story = {
  args: {
    value: 'bug',
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    value: 'chore',
    disabled: true,
  },
};

export const WithOptionIcon: Story = {
  args: {
    value: 'feature',
    options: options.map((option) => ({
      ...option,
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="currentColor" />
        </svg>
      ),
    })),
  },
  parameters: {
    docs: {
      description: {
        story: 'Each option carries a leading icon, rendered in both the trigger and the rows.',
      },
    },
  },
};
