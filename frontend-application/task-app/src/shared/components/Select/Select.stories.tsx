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
    docs: {
      description: {
        component:
          'The only `<select>` in the app — `UserSelect`/task-type pickers compose this instead of a raw element.',
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
