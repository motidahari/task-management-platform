import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { Task } from '../../types';
import { TaskCard } from './TaskCard';

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

describe('TaskCard', () => {
  let onSelect: Mock<(taskId: string) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelect = vi.fn();
  });

  describe('Given:an open task', () => {
    it('should render its type and status name', () => {
      const task = buildTask({ statusName: 'in-progress' });

      render(<TaskCard task={task} onSelect={onSelect} />);

      expect(screen.getByText('development')).toBeInTheDocument();
      expect(screen.getByText('in-progress')).toBeInTheDocument();
    });
  });

  describe('Given:a closed task', () => {
    it('should render the closed badge instead of the status name', () => {
      const task = buildTask({ isClosed: true, statusName: 'done' });

      render(<TaskCard task={task} onSelect={onSelect} />);

      expect(screen.getByText('task-card.closed-badge')).toBeInTheDocument();
      expect(screen.queryByText('done')).not.toBeInTheDocument();
    });
  });

  describe('Given:the card is clicked', () => {
    it('should emit the task id upward', () => {
      const task = buildTask({ id: 't-42' });

      render(<TaskCard task={task} onSelect={onSelect} />);

      fireEvent.click(screen.getByTestId('task-card-t-42'));

      expect(onSelect).toHaveBeenCalledWith('t-42');
    });
  });
});
