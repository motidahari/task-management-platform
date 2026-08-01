import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskHistoryEntry } from '../../services/taskService.dto';
import type { StatusDefinition } from '../../types';
import { HistoryTimeline } from './HistoryTimeline';

vi.mock('../../../../shared/hooks/useTranslation', () => ({
  useTranslation: (scope: string) => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${scope}.${key}:${JSON.stringify(params)}` : `${scope}.${key}`,
  }),
}));

describe('HistoryTimeline', () => {
  const statuses: readonly StatusDefinition[] = [
    { status: 1, name: 'open', displayName: 'Open', requiredFields: [] },
    { status: 2, name: 'in-progress', displayName: 'In progress', requiredFields: [] },
  ];

  const creationEntry: TaskHistoryEntry = {
    fromStatus: null,
    toStatus: 1,
    assignedUserId: 'u-1',
    fieldsSnapshot: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const advanceEntry: TaskHistoryEntry = {
    fromStatus: 1,
    toStatus: 2,
    assignedUserId: 'u-2',
    fieldsSnapshot: { quote: 'looks good' },
    createdAt: '2026-01-02T00:00:00.000Z',
  };

  const identityResolver = (userId: string): string => userId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given:no history has loaded yet and a fetch is in flight', () => {
    it('should render a loading indicator', () => {
      render(
        <HistoryTimeline
          entries={[]}
          statuses={statuses}
          hasMore={false}
          isLoading
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Given:the task has no history entries', () => {
    it('should render the empty state', () => {
      render(
        <HistoryTimeline
          entries={[]}
          statuses={statuses}
          hasMore={false}
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      expect(screen.getByTestId('history-timeline-empty')).toBeInTheDocument();
    });
  });

  describe('Given:a list of transitions', () => {
    it('should render every transition with its assignee and submitted fields', () => {
      render(
        <HistoryTimeline
          entries={[creationEntry, advanceEntry]}
          statuses={statuses}
          hasMore={false}
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      const items = screen.getAllByTestId('history-timeline-entry');
      expect(items).toHaveLength(2);
      expect(items[1]?.textContent).toContain('quote: looks good');
    });
  });

  describe('Given:more pages are available', () => {
    it('should render a load-more control that calls onLoadMore when clicked', () => {
      const onLoadMore = vi.fn();
      render(
        <HistoryTimeline
          entries={[creationEntry]}
          statuses={statuses}
          hasMore
          isLoading={false}
          onLoadMore={onLoadMore}
          resolveAssigneeName={identityResolver}
        />,
      );

      fireEvent.click(screen.getByTestId('history-timeline-load-more'));

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('should append the next page once the caller passes the grown entries list', () => {
      const { rerender } = render(
        <HistoryTimeline
          entries={[creationEntry]}
          statuses={statuses}
          hasMore
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      expect(screen.getAllByTestId('history-timeline-entry')).toHaveLength(1);

      rerender(
        <HistoryTimeline
          entries={[creationEntry, advanceEntry]}
          statuses={statuses}
          hasMore={false}
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      expect(screen.getAllByTestId('history-timeline-entry')).toHaveLength(2);
      expect(screen.queryByTestId('history-timeline-load-more')).not.toBeInTheDocument();
    });
  });

  describe('Given:a resolver that maps some assignee ids to names', () => {
    it('should render the resolved name, falling back to the raw id for an unresolved assignee', () => {
      const resolveAssigneeName = (userId: string): string => (userId === 'u-1' ? 'Alice' : userId);

      render(
        <HistoryTimeline
          entries={[creationEntry, advanceEntry]}
          statuses={statuses}
          hasMore={false}
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={resolveAssigneeName}
        />,
      );

      expect(
        screen.getByText('history-timeline.assignee-label:{"name":"Alice"}'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('history-timeline.assignee-label:{"name":"u-2"}'),
      ).toBeInTheDocument();
    });
  });

  describe('Given:no further pages are available', () => {
    it('should not render the load-more control', () => {
      render(
        <HistoryTimeline
          entries={[creationEntry]}
          statuses={statuses}
          hasMore={false}
          isLoading={false}
          onLoadMore={vi.fn()}
          resolveAssigneeName={identityResolver}
        />,
      );

      expect(screen.queryByTestId('history-timeline-load-more')).not.toBeInTheDocument();
    });
  });
});
