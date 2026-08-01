import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { Column } from './Table';
import { Table } from './Table';

interface TestRow {
  readonly id: string;
  readonly name: string;
}

describe('Table', () => {
  const rows: TestRow[] = [
    { id: '1', name: 'Design the onboarding flow' },
    { id: '2', name: 'Wire the payment webhook' },
  ];

  const columns: Column<TestRow>[] = [
    { key: 'name', header: 'Name', renderCell: (row) => row.name },
  ];

  let onRowSelect: Mock<(row: TestRow) => void>;

  const renderTable = (
    props: Partial<ComponentProps<typeof Table<TestRow>>> = {},
  ): ReturnType<typeof render> =>
    render(
      <Table columns={columns} rows={rows} getRowId={(row) => row.id} caption="Tasks" {...props} />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    onRowSelect = vi.fn();
  });

  describe('Given:rows and columns', () => {
    it('should render a labelled table with a header cell per column and a row per data item', () => {
      renderTable();

      expect(screen.getByRole('table', { name: 'Tasks' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Design the onboarding flow' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Wire the payment webhook' })).toBeInTheDocument();
    });
  });

  describe('Given:no onRowSelect prop', () => {
    it('should render rows that are inert — no aria-selected and not tabbable', () => {
      renderTable();

      const dataRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');
      expect(dataRow).not.toHaveAttribute('aria-selected');
      expect(dataRow).not.toHaveAttribute('tabindex');
    });
  });

  describe('Given:an onRowSelect prop', () => {
    it('should mark every row keyboard-focusable and call onRowSelect on click', () => {
      renderTable({ onRowSelect });

      const dataRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');
      expect(dataRow).toHaveAttribute('tabindex', '0');

      fireEvent.click(dataRow as HTMLElement);

      expect(onRowSelect).toHaveBeenCalledWith(rows[0]);
    });

    it('should call onRowSelect on Enter', () => {
      renderTable({ onRowSelect });

      const dataRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');
      fireEvent.keyDown(dataRow as HTMLElement, { key: 'Enter' });

      expect(onRowSelect).toHaveBeenCalledWith(rows[0]);
    });

    it('should call onRowSelect on Space and prevent the default page scroll', () => {
      renderTable({ onRowSelect });

      const dataRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');
      const wasNotPrevented = fireEvent.keyDown(dataRow as HTMLElement, { key: ' ' });

      expect(onRowSelect).toHaveBeenCalledWith(rows[0]);
      expect(wasNotPrevented).toBe(false);
    });

    it('should ignore other keys', () => {
      renderTable({ onRowSelect });

      const dataRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');
      fireEvent.keyDown(dataRow as HTMLElement, { key: 'a' });

      expect(onRowSelect).not.toHaveBeenCalled();
    });
  });

  describe('Given:a selectedRowId matching a row', () => {
    it('should mark that row aria-selected and leave the rest unselected', () => {
      renderTable({ onRowSelect, selectedRowId: '2' });

      const selectedRow = screen
        .getByRole('cell', { name: 'Wire the payment webhook' })
        .closest('tr');
      const otherRow = screen
        .getByRole('cell', { name: 'Design the onboarding flow' })
        .closest('tr');

      expect(selectedRow).toHaveAttribute('aria-selected', 'true');
      expect(otherRow).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('Given:isLoading is true', () => {
    it('should render skeleton placeholder rows instead of the data rows', () => {
      renderTable({ isLoading: true });

      expect(screen.queryByText('Design the onboarding flow')).not.toBeInTheDocument();
      // The skeleton rows are aria-hidden, so they're queried by CSS rather than role.
      const table = screen.getByRole('table');
      expect(within(table).getByRole('columnheader')).toBeInTheDocument();
      expect(table.querySelectorAll('tbody .table__row')).toHaveLength(5);
      expect(table.querySelectorAll('.skeleton--text')).toHaveLength(5);
    });

    it('should not render the empty state while loading', () => {
      renderTable({ isLoading: true, rows: [], emptyState: <p>No tasks yet.</p> });

      expect(screen.queryByText('No tasks yet.')).not.toBeInTheDocument();
    });
  });

  describe('Given:no rows and not loading', () => {
    it('should render the emptyState node in a full-width cell', () => {
      renderTable({ rows: [], emptyState: <p>No tasks yet.</p> });

      const emptyCell = screen.getByText('No tasks yet.').closest('td');
      expect(emptyCell).toHaveAttribute('colspan', String(columns.length));
    });
  });

  describe('Given:a testId prop', () => {
    it('should apply it as data-testid on the table', () => {
      renderTable({ testId: 'task-table' });

      expect(screen.getByTestId('task-table')).toBe(screen.getByRole('table'));
    });
  });
});
