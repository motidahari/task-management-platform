import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '../../features/tasks/stores/useTaskStore';
import type { TaskStoreState } from '../../features/tasks/stores/useTaskStore';
import type { Task } from '../../features/tasks/types';
import { LegacyTaskRedirect } from './LegacyTaskRedirect';

vi.mock('../../features/tasks/stores/useTaskStore', () => ({ useTaskStore: vi.fn() }));

const mockedUseTaskStore = vi.mocked(useTaskStore);

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    type: 'development',
    status: 1,
    statusName: 'open',
    isClosed: false,
    assignedUserId: 'u-9',
    customFields: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockTaskStore(overrides: Partial<TaskStoreState> = {}): Pick<TaskStoreState, 'fetchTask'> {
  const fetchTask = vi.fn().mockResolvedValue(true);
  const state: TaskStoreState = {
    items: [],
    nextCursor: null,
    currentTask: null,
    listUserId: null,
    isLoading: false,
    error: null,
    historyItems: [],
    historyNextCursor: null,
    fetchTasksForUser: vi.fn(),
    fetchTask,
    fetchTaskHistory: vi.fn(),
    createTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    closeTask: vi.fn(),
    applyTaskEvent: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };

  mockedUseTaskStore.mockImplementation((selector: (state: TaskStoreState) => unknown) =>
    selector(state),
  );

  return { fetchTask };
}

function renderLegacyRedirect(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/tasks/t-1']}>
      <Routes>
        <Route path="/tasks/:taskId" element={<LegacyTaskRedirect />} />
        <Route path="/users/:userId/tasks/:taskId" element={<div>landed in the new shape</div>} />
        <Route path="/" element={<div>landed on the gate</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LegacyTaskRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:the task loads and resolves an assignee', () => {
    it('should fetch the task and redirect to its assignee’s scoped detail route', () => {
      const { fetchTask } = mockTaskStore({ currentTask: buildTask() });

      renderLegacyRedirect();

      expect(fetchTask).toHaveBeenCalledWith('t-1');
      expect(screen.getByText('landed in the new shape')).toBeInTheDocument();
    });
  });

  describe('Given:the task fails to load', () => {
    it('should redirect to the root gate instead of a dead end', async () => {
      mockTaskStore({ fetchTask: vi.fn().mockResolvedValue(false) });

      renderLegacyRedirect();

      expect(await screen.findByText('landed on the gate')).toBeInTheDocument();
    });
  });

  describe('Given:the task hasn’t resolved yet', () => {
    it('should render a loading indicator rather than a blank screen', () => {
      mockTaskStore({ fetchTask: vi.fn().mockReturnValue(new Promise(() => {})) });

      renderLegacyRedirect();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
