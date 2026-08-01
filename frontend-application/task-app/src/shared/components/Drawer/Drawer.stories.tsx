import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Button } from '../Button';
import { Drawer } from './Drawer';

function DrawerTrigger(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open drawer</Button>
      {isOpen && (
        <Drawer title="Task details" onClose={() => setIsOpen(false)}>
          <p>Everything about this task lives here.</p>
        </Drawer>
      )}
    </>
  );
}

const meta = {
  title: 'Shared/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  parameters: {
    // The backdrop is fixed to the viewport, so the canvas needs the full
    // frame and the docs page needs its own iframe — an inline docs block
    // is only a couple of hundred pixels tall and crops the panel.
    layout: 'fullscreen',
    docs: {
      story: { inline: false, height: '480px' },
      description: {
        component:
          "The single right-anchored overlay panel — shares Modal's focus trap and Esc handling via the shared `focusTrap` util, and locks page scroll while it is mounted so the content behind it can't scroll underneath.",
      },
    },
  },
  args: {
    title: 'Task details',
    onClose: (): void => {},
    children: <p>Everything about this task lives here.</p>,
  },
} satisfies Meta<typeof Drawer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OpenByDefault: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Mounted already open, exactly as a route-driven detail panel renders it — focus moves into the dialog, and Esc, the backdrop, and the close button all call `onClose`.',
      },
    },
  },
};

export const WithFooter: Story = {
  args: {
    footer: (
      <>
        <Button variant="secondary">Cancel</Button>
        <Button>Save</Button>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'An optional footer row for the primary action, pinned below the scrollable body.',
      },
    },
  },
};

export const MediumWidth: Story = {
  args: {
    width: 'md',
  },
};

export const TriggeredFromButton: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'A trigger button mounts and unmounts the panel, demonstrating the full open/close cycle.',
      },
    },
  },
  render: (): ReactElement => <DrawerTrigger />,
};
