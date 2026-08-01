import type { ReactElement } from 'react';

import { Avatar } from '../../../../shared/components/Avatar';
import { Button } from '../../../../shared/components/Button';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { useTranslation } from '../../../../shared/hooks/useTranslation';
import type { TaskHistoryEntry } from '../../services/taskService.dto';
import type { StatusDefinition } from '../../types';
import './HistoryTimeline.scss';

const RELATIVE_TIME_UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** The absolute instant stays reachable via the caller's `title` attribute — this only formats the relative label. */
export function formatRelativeTime(dateIso: string, now: Date = new Date()): string {
  const elapsedMs = new Date(dateIso).getTime() - now.getTime();
  const unitEntry = RELATIVE_TIME_UNITS.find(({ ms }) => Math.abs(elapsedMs) >= ms);

  if (!unitEntry) {
    return relativeTimeFormatter.format(Math.round(elapsedMs / 1000), 'second');
  }
  return relativeTimeFormatter.format(Math.round(elapsedMs / unitEntry.ms), unitEntry.unit);
}

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
 * Read-only, oldest-first activity feed of every transition a task went
 * through — visible even once the task is closed and every mutating control
 * is gone, since the audit trail outlives the task's mutability. Each entry
 * carries an avatar seeded by that entry's own assignee, not the task's
 * current one, so the feed reflects who actually made that transition.
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
    return <Skeleton variant="text" count={3} />;
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
            <Avatar
              seed={entry.assignedUserId}
              alt={resolveAssigneeName(entry.assignedUserId)}
              size={32}
            />
            <div className="history-timeline__body">
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
              <time
                className="history-timeline__timestamp"
                dateTime={entry.createdAt}
                title={new Date(entry.createdAt).toLocaleString()}
              >
                {formatRelativeTime(entry.createdAt)}
              </time>
            </div>
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
