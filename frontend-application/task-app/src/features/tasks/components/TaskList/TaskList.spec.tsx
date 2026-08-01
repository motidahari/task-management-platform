import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { Task } from '../../types';
import { TaskList } from './TaskList';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1234567890',
    type: 'development',
    status: 1,
    statusName: 'created',
    isClosed: false,
    assignedUserId: 'u-1',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TaskList', () => {
  const resolveStatusDisplayName = (_type: string, status: number): string =>
    status === 2 ? 'Specification completed' : `Status ${status}`;

  let onSelectTask: Mock<(taskId: string) => void>;
  let onLoadMore: Mock<() => void>;

  const resolveAssigneeName = (userId: string): string => userId;
  const resolveTypeDisplayName = (type: string): string => type;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelectTask = vi.fn();
    onLoadMore = vi.fn();
  });

  describe('Given:the initial load is in flight and nothing is loaded yet', () => {
    it('should render the table in its own loading state instead of the empty state', () => {
      render(
        <TaskList
          tasks={[]}
          isLoading
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.queryByText('task-list.empty-state')).not.toBeInTheDocument();
    });
  });

  describe('Given:no tasks and nothing loading', () => {
    it('should render the empty state', () => {
      render(
        <TaskList
          tasks={[]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      expect(screen.getByText('task-list.empty-state')).toBeInTheDocument();
    });
  });

  describe('Given:a loaded page of tasks', () => {
    it('should render one row per task with its id prefix, type, status, state and assignee', () => {
      const task = buildTask({
        id: 't-1234567890',
        type: 'development',
        status: 2,
        statusName: 'in-progress',
        isClosed: false,
        assignedUserId: 'u-1',
      });

      render(
        <TaskList
          tasks={[task]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={() => 'Alice'}
          resolveTypeDisplayName={() => 'Development'}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      const row = screen.getByText('Development').closest('tr') as HTMLElement;
      expect(within(row).getByTitle('t-1234567890')).toHaveTextContent('t-123456');
      expect(
        within(row).getByText(
          'task-list.status-badge:{"status":2,"statusName":"Specification completed"}',
        ),
      ).toBeInTheDocument();
      expect(within(row).getByText('task-list.state-open')).toBeInTheDocument();
      expect(within(row).getByText('Alice')).toBeInTheDocument();
    });

    it('should render the closed label and closed state badge for a closed task', () => {
      const task = buildTask({ isClosed: true, statusName: 'done' });

      render(
        <TaskList
          tasks={[task]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      expect(screen.getByText('task-list.closed-badge')).toBeInTheDocument();
      expect(screen.getByText('task-list.state-closed')).toBeInTheDocument();
      expect(screen.queryByText('done')).not.toBeInTheDocument();
    });

    it('should emit the clicked task id upward', () => {
      const task = buildTask({ id: 't-1' });

      render(
        <TaskList
          tasks={[task]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      fireEvent.click(screen.getByTitle('t-1'));

      expect(onSelectTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('Given:a selectedTaskId matching a row', () => {
    it('should mark that row selected', () => {
      const task = buildTask({ id: 't-1' });

      render(
        <TaskList
          tasks={[task]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
          selectedTaskId="t-1"
        />,
      );

      const row = screen.getByTitle('t-1').closest('tr');
      expect(row).toHaveAttribute('aria-selected', 'true');
    });
  });

  describe('Given:the server reports a next page', () => {
    it('should render a "load more" action that triggers the callback', () => {
      render(
        <TaskList
          tasks={[buildTask()]}
          isLoading={false}
          hasMore
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      fireEvent.click(screen.getByTestId('task-list-load-more'));

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:there is no next page', () => {
    it('should not render the "load more" action', () => {
      render(
        <TaskList
          tasks={[buildTask()]}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
          resolveTypeDisplayName={resolveTypeDisplayName}
          resolveStatusDisplayName={resolveStatusDisplayName}
        />,
      );

      expect(screen.queryByTestId('task-list-load-more')).not.toBeInTheDocument();
    });
  });
});
