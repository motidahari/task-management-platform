import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { TextField, type TextFieldProps } from './TextField';

function ControlledTextField(props: TextFieldProps): ReactElement {
  const [value, setValue] = useState(props.value);
  return <TextField {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Shared/TextField',
  component: TextField,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The only free-text input in the app — `DynamicFieldsForm`/`CreateTaskForm` compose this instead of a raw `<input>`.',
      },
    },
  },
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['text', 'number', 'email'],
    },
  },
  args: {
    id: 'title',
    label: 'Title',
    value: '',
    onChange: (): void => {},
  },
  render: (args): ReactElement => <ControlledTextField {...args} />,
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPlaceholder: Story = {
  args: {
    placeholder: 'Enter a title…',
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
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    value: 'Design the onboarding flow',
    disabled: true,
  },
};

export const WithCharacterCounter: Story = {
  args: {
    value: 'Design',
    maxLength: 40,
  },
  parameters: {
    docs: {
      description: {
        story: 'A `maxLength` prop renders a live character counter below the input.',
      },
    },
  },
};

export const NumberType: Story = {
  args: {
    id: 'estimate',
    label: 'Estimate (hours)',
    type: 'number',
    value: '4',
  },
};

export const EmailType: Story = {
  args: {
    id: 'contact-email',
    label: 'Contact email',
    type: 'email',
    value: '',
    placeholder: 'name@example.com',
  },
};
