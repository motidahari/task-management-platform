import type { ReactElement } from 'react';

import { Button } from '../../../../shared/components/Button';
import { Spinner } from '../../../../shared/components/Spinner';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { TaskHistoryEntry } from '../../services/taskService.dto';
import type { StatusDefinition } from '../../types';
import './HistoryTimeline.scss';

export interface HistoryTimelineProps {
  readonly entries: readonly TaskHistoryEntry[];
  readonly statuses: readonly StatusDefinition[];
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly onLoadMore: () => void;
  readonly resolveAssigneeName: (userId: string) => string;
}

type TranslateEntry = (key: string, params?: Record<string, unknown>) => string;

function statusDisplayName(status: number, statuses: readonly StatusDefinition[]): string {
  return statuses.find((definition) => definition.status === status)?.displayName ?? String(status);
}

/**
 * `fromStatus`/`toStatus` are the only nullable edges of a transition —
 * creation has no `fromStatus`, close has no `toStatus` — so the transition
 * label is resolved per case instead of trying to force both through one
 * generic "from → to" template.
 */
function resolveTransitionLabel(
  entry: TaskHistoryEntry,
  statuses: readonly StatusDefinition[],
  t: TranslateEntry,
): string {
  if (entry.fromStatus === null) {
    return t('created-transition', { to: statusDisplayName(entry.toStatus as number, statuses) });
  }
  if (entry.toStatus === null) {
    return t('closed-transition', { from: statusDisplayName(entry.fromStatus, statuses) });
  }
  return t('changed-transition', {
    from: statusDisplayName(entry.fromStatus, statuses),
    to: statusDisplayName(entry.toStatus, statuses),
  });
}

function entryKey(entry: TaskHistoryEntry): string {
  return `${entry.createdAt}-${entry.toStatus ?? 'closed'}`;
}

/**
 * Read-only, oldest-first audit trail of every transition a task went
 * through — visible even once the task is closed and every mutating control
 * is gone, since the audit trail outlives the task's mutability.
 */
export function HistoryTimeline({
  entries,
  statuses,
  hasMore,
  isLoading,
  onLoadMore,
  resolveAssigneeName,
}: HistoryTimelineProps): ReactElement {
  const { t } = useTranslation('history-timeline');
  const isInitialLoad = isLoading && entries.length === 0;

  if (isInitialLoad) {
    return <Spinner />;
  }

  if (entries.length === 0) {
    return (
      <p className="history-timeline__empty" data-testid="history-timeline-empty">
        {t('empty-message')}
      </p>
    );
  }

  return (
    <div className="history-timeline" data-testid="history-timeline">
      <ol className="history-timeline__list">
        {entries.map((entry) => (
          <li
            key={entryKey(entry)}
            className="history-timeline__entry"
            data-testid="history-timeline-entry"
          >
            <p className="history-timeline__transition">
              {resolveTransitionLabel(entry, statuses, t)}
            </p>
            <p className="history-timeline__meta">
              {t('assignee-label', { name: resolveAssigneeName(entry.assignedUserId) })}
            </p>
            {Object.keys(entry.fieldsSnapshot).length > 0 && (
              <ul className="history-timeline__fields">
                {Object.entries(entry.fieldsSnapshot).map(([key, value]) => (
                  <li key={key}>
                    {key}: {String(value)}
                  </li>
                ))}
              </ul>
            )}
            <time className="history-timeline__timestamp" dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
      {hasMore && (
        <Button
          variant="secondary"
          loading={isLoading}
          onClick={onLoadMore}
          testId="history-timeline-load-more"
        >
          {t('load-more-button')}
        </Button>
      )}
    </div>
  );
}
