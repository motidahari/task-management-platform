import { fireEvent, render, screen } from '@testing-library/react';
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
    id: 't-1',
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
  let onSelectTask: Mock<(taskId: string) => void>;
  let onLoadMore: Mock<() => void>;

  const resolveAssigneeName = (userId: string): string => userId;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelectTask = vi.fn();
    onLoadMore = vi.fn();
  });

  describe('Given:the initial load is in flight and nothing is loaded yet', () => {
    it('should render the loading indicator instead of the empty state', () => {
      render(
        <TaskList
          tasks={[]}
          isLoading
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
        />,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
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
        />,
      );

      expect(screen.getByText('task-list.empty-state')).toBeInTheDocument();
    });
  });

  describe('Given:a loaded page of tasks', () => {
    it('should render one card per task', () => {
      const tasks = [buildTask({ id: 't-1' }), buildTask({ id: 't-2' })];

      render(
        <TaskList
          tasks={tasks}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
        />,
      );

      expect(screen.getAllByTestId('task-card')).toHaveLength(2);
    });

    it('should emit the clicked task id upward', () => {
      const tasks = [buildTask({ id: 't-1' })];

      render(
        <TaskList
          tasks={tasks}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={resolveAssigneeName}
        />,
      );

      fireEvent.click(screen.getByTestId('task-card-t-1'));

      expect(onSelectTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('Given:a resolver that maps assignee ids to names', () => {
    it('should pass each task’s resolved assignee name to its card', () => {
      const tasks = [buildTask({ id: 't-1', assignedUserId: 'u-1' })];

      render(
        <TaskList
          tasks={tasks}
          isLoading={false}
          hasMore={false}
          onSelectTask={onSelectTask}
          onLoadMore={onLoadMore}
          resolveAssigneeName={() => 'Alice'}
        />,
      );

      expect(screen.getByText('task-card.assignee-label:{"name":"Alice"}')).toBeInTheDocument();
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
        />,
      );

      expect(screen.queryByTestId('task-list-load-more')).not.toBeInTheDocument();
    });
  });
});
