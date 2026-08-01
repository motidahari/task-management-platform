import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';
import './Table.scss';

export type ColumnAlign = 'start' | 'end';

export interface Column<TRow> {
  readonly key: string;
  readonly header: string;
  readonly align?: ColumnAlign;
  readonly width?: string;
  readonly renderCell: (row: TRow) => ReactNode;
}

export interface TableProps<TRow> {
  readonly columns: readonly Column<TRow>[];
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow) => string;
  readonly onRowSelect?: (row: TRow) => void;
  readonly selectedRowId?: string;
  readonly isLoading?: boolean;
  readonly emptyState?: ReactNode;
  readonly caption: string;
  readonly testId?: string;
}

const SKELETON_ROW_COUNT = 5;

function alignClassName(align: ColumnAlign | undefined, block: string): string {
  return align === 'end' ? ` ${block}--end` : '';
}

function renderSkeletonRows<TRow>(columns: readonly Column<TRow>[]): ReactElement[] {
  return Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
    <tr key={`skeleton-${rowIndex}`} className="table__row" aria-hidden="true">
      {columns.map((column) => (
        <td
          key={column.key}
          className={`table__cell${alignClassName(column.align, 'table__cell')}`}
        >
          <Skeleton variant="text" />
        </td>
      ))}
    </tr>
  ));
}

/**
 * The only tabular list surface in the app — presentational and generic over
 * its row shape; data fetching, pagination and selection state all live in
 * the caller. A row is keyboard-activatable only when `onRowSelect` is given.
 */
export function Table<TRow>({
  columns,
  rows,
  getRowId,
  onRowSelect,
  selectedRowId,
  isLoading = false,
  emptyState,
  caption,
  testId,
}: TableProps<TRow>): ReactElement {
  const isSelectable = Boolean(onRowSelect);
  const hasColumnWidths = columns.some((column) => column.width !== undefined);
  const isEmpty = !isLoading && rows.length === 0;

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: TRow): void {
    if (!onRowSelect) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    // Space scrolls the page by default — the row is the activation target here, not a scroll trigger.
    if (event.key === ' ') event.preventDefault();
    onRowSelect(row);
  }

  return (
    <table className="table" data-testid={testId}>
      <caption className="visually-hidden">{caption}</caption>
      {hasColumnWidths && (
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
      )}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`table__header-cell${alignClassName(column.align, 'table__header-cell')}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {isLoading && renderSkeletonRows(columns)}
        {isEmpty && (
          <tr>
            <td className="table__empty-cell" colSpan={columns.length}>
              {emptyState}
            </td>
          </tr>
        )}
        {!isLoading &&
          rows.map((row) => {
            const rowId = getRowId(row);
            const isSelected = rowId === selectedRowId;

            return (
              <tr
                key={rowId}
                className={`table__row${isSelectable ? ' table__row--selectable' : ''}`}
                aria-selected={isSelectable ? isSelected : undefined}
                tabIndex={isSelectable ? 0 : undefined}
                onClick={isSelectable ? () => onRowSelect?.(row) : undefined}
                onKeyDown={isSelectable ? (event) => handleRowKeyDown(event, row) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`table__cell${alignClassName(column.align, 'table__cell')}`}
                  >
                    {column.renderCell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}
