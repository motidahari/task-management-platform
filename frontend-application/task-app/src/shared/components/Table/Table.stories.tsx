import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Badge } from '../Badge';
import type { Column } from './Table';
import { Table } from './Table';

interface ExampleRow {
  readonly id: string;
  readonly name: string;
  readonly status: 'Open' | 'Closed';
}

const rows: readonly ExampleRow[] = [
  { id: '1', name: 'Design the onboarding flow', status: 'Open' },
  { id: '2', name: 'Wire the payment webhook', status: 'Closed' },
  { id: '3', name: 'Draft the release notes', status: 'Open' },
];

const columns: readonly Column<ExampleRow>[] = [
  { key: 'name', header: 'Name', renderCell: (row) => row.name },
  {
    key: 'status',
    header: 'Status',
    align: 'end',
    width: '120px',
    renderCell: (row) => (
      <Badge variant={row.status === 'Open' ? 'success' : 'neutral'}>{row.status}</Badge>
    ),
  },
];

function SelectableTable(): ReactElement {
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>(undefined);

  return (
    <Table
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      caption="Tasks"
      selectedRowId={selectedRowId}
      onRowSelect={(row) => setSelectedRowId(row.id)}
    />
  );
}

const meta = {
  title: 'Shared/Table',
  component: Table<ExampleRow>,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Presentational and generic over its row shape; data fetching, pagination and selection state all live in the caller. A row is keyboard-activatable (Enter/Space) and carries aria-selected only when `onRowSelect` is given.',
      },
    },
  },
  args: {
    columns,
    rows,
    getRowId: (row: ExampleRow) => row.id,
    caption: 'Tasks',
  },
} satisfies Meta<typeof Table<ExampleRow>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selectable: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'With `onRowSelect`, rows become keyboard-activatable and the clicked row carries `aria-selected`.',
      },
    },
  },
  render: (): ReactElement => <SelectableTable />,
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Placeholder rows preserve each column's width while data loads. These are Table's own interim bars — a later task composes the shared `Skeleton` component instead.",
      },
    },
  },
};

export const Empty: Story = {
  args: {
    rows: [],
    emptyState: <p>No tasks yet.</p>,
  },
};
