import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskTypeStoreState } from '../../stores/useTaskTypeStore';
import { useTaskTypeStore } from '../../stores/useTaskTypeStore';
import { TaskTypesGate } from './TaskTypesGate';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({ t: (key: string) => `${scope}.${key}` }),
}));

vi.mock('../../stores/useTaskTypeStore', () => ({
  useTaskTypeStore: vi.fn(),
}));

describe('TaskTypesGate', () => {
  const mockedUseTaskTypeStore = vi.mocked(useTaskTypeStore);

  function mockStoreState(
    overrides: Partial<TaskTypeStoreState> & { status: TaskTypeStoreState['status'] },
  ): ReturnType<typeof vi.fn> {
    const loadTaskTypes = vi.fn();
    const state: TaskTypeStoreState = {
      definitions: [],
      error: null,
      loadTaskTypes,
      ...overrides,
    };

    mockedUseTaskTypeStore.mockImplementation((selector: (state: TaskTypeStoreState) => unknown) =>
      selector(state),
    );

    return loadTaskTypes;
  }

  const renderGate = (): ReturnType<typeof render> =>
    render(
      <TaskTypesGate>
        <div>protected content</div>
      </TaskTypesGate>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:the task-type metadata is idle on mount', () => {
    it('should trigger the initial load and render the loading placeholder', () => {
      const loadTaskTypes = mockStoreState({ status: 'idle' });

      renderGate();

      expect(loadTaskTypes).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    });
  });

  describe('Given:the task-type metadata is loading', () => {
    it('should render the loading placeholder without triggering another load', () => {
      const loadTaskTypes = mockStoreState({ status: 'loading' });

      renderGate();

      expect(loadTaskTypes).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Given:every automatic attempt to load the task-type metadata failed', () => {
    it('should render a full-screen retry state and re-trigger the load on click', () => {
      const loadTaskTypes = mockStoreState({ status: 'error' });

      renderGate();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText('protected content')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button'));

      expect(loadTaskTypes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given:the task-type metadata resolved', () => {
    it('should render the children instead of the spinner or the retry state', () => {
      mockStoreState({ status: 'ready' });

      renderGate();

      expect(screen.getByText('protected content')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
