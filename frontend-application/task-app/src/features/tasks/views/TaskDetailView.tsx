import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useBus } from '../../../core/bus/useBus';
import type { ApiError } from '../../../core/types/api-error';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import type { SelectOption } from '../../../shared/components/Select';
import { Spinner } from '../../../shared/components/Spinner';
import { useTranslation } from '../../../shared/hooks/useTranslation';
import { resolveErrorText } from '../../../shared/utils/resolveErrorText';
import { AssigneeSelect } from '../components/AssigneeSelect';
import {
  DynamicFieldsForm,
  getMissingRequiredFieldKeys,
  type DynamicFieldsFormValues,
} from '../components/DynamicFieldsForm';
import { HistoryTimeline } from '../components/HistoryTimeline';
import { StatusStepper } from '../components/StatusStepper';
import { useTaskLifecycle } from '../hooks/useTaskLifecycle';
import { useTaskRealtime } from '../hooks/useTaskRealtime';
import { useCurrentUserStore } from '../stores/useCurrentUserStore';
import { useTaskStore } from '../stores/useTaskStore';
import { useTaskTypeStore } from '../stores/useTaskTypeStore';
import type { StatusDefinition, Task, TaskTypeDefinition, User } from '../types';
import './TaskDetailView.scss';

type ActiveAction = 'advance' | 'reverse' | null;

/**
 * Task/history payloads carry only an assignee id, by contract — this is the
 * one place that turns those ids into the names both the timeline and the
 * reassignment picker show, falling back to the raw id for anyone outside
 * the loaded directory rather than a blank.
 */
function buildAssigneeNameLookup(users: readonly User[]): Record<string, string> {
  return Object.fromEntries(users.map((user) => [user.id, user.name]));
}

function findTaskType(
  definitions: readonly TaskTypeDefinition[],
  type: string,
): TaskTypeDefinition | undefined {
  return definitions.find((definition) => definition.type === type);
}

function findStatusIndex(statuses: readonly StatusDefinition[], status: number): number {
  return statuses.findIndex((definition) => definition.status === status);
}

/**
 * Reassignment candidates' ids come entirely from data this task already
 * carries — its current assignee plus everyone the history shows it was
 * ever handed to — rather than a separate query, so the picker stays
 * populated with real, task-relevant people with no extra request. Each
 * id's label is resolved to a name via the loaded user directory, falling
 * back to the raw id for a candidate outside it.
 */
function collectAssigneeOptions(
  task: Task,
  historyAssigneeIds: readonly string[],
  resolveAssigneeName: (userId: string) => string,
): SelectOption[] {
  const ids = new Set([task.assignedUserId, ...historyAssigneeIds]);
  return Array.from(ids).map((id) => ({ value: id, label: resolveAssigneeName(id) }));
}

function extractMissingFields(error: ApiError | null): readonly string[] {
  if (!error?.details || !('missing' in error.details)) return [];
  return error.details.missing ?? [];
}

/**
 * The task's stepper, read-only fields, advance/reverse/close controls, and
 * its audit-trail timeline, all wired to one task's live state. Every
 * mutation (via `useTaskLifecycle`) already carries `expectedStatus`, so a
 * stale conflict resolves itself: the store refetches, `currentTask` changes,
 * and the effect below closes whatever form was open and lands the screen on
 * the true state — no bespoke conflict handling lives in this component.
 */
export function TaskDetailView(): ReactElement {
  const taskId = useParams<{ taskId: string }>().taskId ?? '';
  const { t } = useTranslation('task-detail-view');
  const { t: translateRaw } = useI18nTranslation();
  const { emit } = useBus();

  const currentTask = useTaskStore((state) => state.currentTask);
  const isLoading = useTaskStore((state) => state.isLoading);
  const error = useTaskStore((state) => state.error);
  const historyItems = useTaskStore((state) => state.historyItems);
  const historyNextCursor = useTaskStore((state) => state.historyNextCursor);
  const fetchTask = useTaskStore((state) => state.fetchTask);
  const fetchTaskHistory = useTaskStore((state) => state.fetchTaskHistory);
  const taskTypeDefinitions = useTaskTypeStore((state) => state.definitions);
  const users = useCurrentUserStore((state) => state.users);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);
  const lifecycle = useTaskLifecycle();

  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [customFieldValues, setCustomFieldValues] = useState<DynamicFieldsFormValues>({});
  const [nextAssignedUserId, setNextAssignedUserId] = useState('');
  const [missingFieldKeys, setMissingFieldKeys] = useState<readonly string[]>([]);

  const refetch = useCallback(() => {
    if (taskId !== '') void fetchTask(taskId);
  }, [taskId, fetchTask]);

  useTaskRealtime({ mode: 'detail', taskId }, refetch);

  useEffect(() => {
    if (taskId === '') return;
    void fetchTask(taskId);
    void fetchTaskHistory(taskId);
  }, [taskId, fetchTask, fetchTaskHistory]);

  // A user landing here directly (rather than via `MyTasksView`) has no
  // directory loaded yet; one arriving from the picker already does, so this
  // never re-fetches on top of it.
  useEffect(() => {
    if (users.length === 0) void fetchUsers();
  }, [users.length, fetchUsers]);

  // A task change (a successful mutation, or the auto-refetch that follows a
  // TASK_STATE_CONFLICT) always makes whatever form was open stale — closing
  // it here means neither success nor conflict recovery needs its own
  // bespoke "now close the form" call.
  useEffect(() => {
    setActiveAction(null);
    setCustomFieldValues({});
    setMissingFieldKeys([]);
    setNextAssignedUserId(currentTask?.assignedUserId ?? '');
  }, [currentTask?.id, currentTask?.status]);

  // `details.missing` only ever applies to the fields of the advance form —
  // reverse and close carry no submitted fields to highlight.
  useEffect(() => {
    if (activeAction !== 'advance') return;
    setMissingFieldKeys(extractMissingFields(error));
  }, [error, activeAction]);

  const taskTypeDef = useMemo(
    () => (currentTask ? findTaskType(taskTypeDefinitions, currentTask.type) : undefined),
    [taskTypeDefinitions, currentTask],
  );
  const statuses = taskTypeDef?.statuses ?? [];
  const currentStatusIndex = currentTask ? findStatusIndex(statuses, currentTask.status) : -1;
  const nextStatusDef = currentStatusIndex >= 0 ? statuses[currentStatusIndex + 1] : undefined;
  const canAdvance = Boolean(nextStatusDef);
  const canReverse = currentStatusIndex > 0;
  const canClose = currentTask !== null && currentTask.status === taskTypeDef?.finalStatus;

  const assigneeNamesById = useMemo(() => buildAssigneeNameLookup(users), [users]);
  const resolveAssigneeName = useCallback(
    (userId: string) => assigneeNamesById[userId] ?? userId,
    [assigneeNamesById],
  );

  const historyAssigneeIds = useMemo(
    () => historyItems.map((entry) => entry.assignedUserId),
    [historyItems],
  );
  const assigneeOptions = useMemo(
    () =>
      currentTask
        ? collectAssigneeOptions(currentTask, historyAssigneeIds, resolveAssigneeName)
        : [],
    [currentTask, historyAssigneeIds, resolveAssigneeName],
  );

  function openAdvance(): void {
    setActiveAction('advance');
  }

  function openReverse(): void {
    setActiveAction('reverse');
  }

  function cancelAction(): void {
    setActiveAction(null);
    setMissingFieldKeys([]);
  }

  function handleCloseClick(): void {
    if (!currentTask) return;
    const taskToClose = currentTask;

    emit('modal:open', {
      id: 'confirm',
      props: {
        title: t('close-confirm-title'),
        message: t('close-confirm-message'),
        confirmLabel: t('close-confirm-button'),
        cancelLabel: t('cancel-button'),
        onConfirm: () => void lifecycle.close(taskToClose.id),
      },
    });
  }

  async function submitAdvance(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!currentTask || !nextStatusDef || nextAssignedUserId === '') return;

    const missing = getMissingRequiredFieldKeys(nextStatusDef.requiredFields, customFieldValues);
    if (missing.length > 0) {
      setMissingFieldKeys(missing);
      return;
    }

    await lifecycle.advance({
      taskId: currentTask.id,
      expectedStatus: currentTask.status,
      nextAssignedUserId,
      customFields: customFieldValues,
    });
  }

  async function submitReverse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!currentTask || nextAssignedUserId === '') return;

    await lifecycle.reverse({
      taskId: currentTask.id,
      expectedStatus: currentTask.status,
      nextAssignedUserId,
    });
  }

  function handleLoadMoreHistory(): void {
    if (taskId === '' || historyNextCursor === null) return;
    void fetchTaskHistory(taskId, { cursor: historyNextCursor });
  }

  if (!currentTask && isLoading) {
    return <Spinner />;
  }

  if (!currentTask && error) {
    return (
      <div className="task-detail-view task-detail-view--error" role="alert">
        <p className="task-detail-view__error-message">{resolveErrorText(error, translateRaw)}</p>
        <Button onClick={refetch} testId="task-detail-view-retry">
          {t('retry-button')}
        </Button>
      </div>
    );
  }

  if (!currentTask) {
    return <Spinner />;
  }

  return (
    <div className="task-detail-view" data-testid="task-detail-view">
      <Card testId="task-detail-view-card">
        <header className="task-detail-view__header">
          <h2 className="task-detail-view__title">
            {taskTypeDef?.displayName ?? currentTask.type}
          </h2>
          {currentTask.isClosed && <Badge>{t('closed-badge')}</Badge>}
        </header>

        <StatusStepper statuses={statuses} currentStatus={currentTask.status} />

        <section aria-label={t('fields-heading')} className="task-detail-view__fields">
          <h3>{t('fields-heading')}</h3>
          {Object.keys(currentTask.customFields).length === 0 ? (
            <p>{t('no-fields-message')}</p>
          ) : (
            <dl>
              {Object.entries(currentTask.customFields).map(([key, value]) => (
                <div className="task-detail-view__field" key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {!currentTask.isClosed && (
          <section className="task-detail-view__actions" data-testid="task-detail-view-actions">
            {activeAction === null && (
              <div className="task-detail-view__action-buttons">
                <Button onClick={openAdvance} disabled={!canAdvance} testId="advance-button">
                  {t('advance-button')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={openReverse}
                  disabled={!canReverse}
                  testId="reverse-button"
                >
                  {t('reverse-button')}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleCloseClick}
                  disabled={!canClose}
                  testId="close-button"
                >
                  {t('close-button')}
                </Button>
              </div>
            )}

            {activeAction === 'advance' && nextStatusDef && (
              <form
                className="task-detail-view__form"
                data-testid="advance-form"
                onSubmit={(event) => void submitAdvance(event)}
              >
                <DynamicFieldsForm
                  descriptors={nextStatusDef.requiredFields}
                  values={customFieldValues}
                  onChange={(key, value) =>
                    setCustomFieldValues((current) => ({ ...current, [key]: value }))
                  }
                  missingFields={missingFieldKeys}
                  disabled={lifecycle.isSubmitting}
                />
                <AssigneeSelect
                  value={nextAssignedUserId}
                  options={assigneeOptions}
                  onChange={setNextAssignedUserId}
                  disabled={lifecycle.isSubmitting}
                />
                <div className="task-detail-view__form-actions">
                  <Button type="submit" loading={lifecycle.isSubmitting} testId="advance-submit">
                    {t('submit-button')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={cancelAction}
                    disabled={lifecycle.isSubmitting}
                  >
                    {t('cancel-button')}
                  </Button>
                </div>
              </form>
            )}

            {activeAction === 'reverse' && (
              <form
                className="task-detail-view__form"
                data-testid="reverse-form"
                onSubmit={(event) => void submitReverse(event)}
              >
                <AssigneeSelect
                  value={nextAssignedUserId}
                  options={assigneeOptions}
                  onChange={setNextAssignedUserId}
                  disabled={lifecycle.isSubmitting}
                />
                <div className="task-detail-view__form-actions">
                  <Button type="submit" loading={lifecycle.isSubmitting} testId="reverse-submit">
                    {t('submit-button')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={cancelAction}
                    disabled={lifecycle.isSubmitting}
                  >
                    {t('cancel-button')}
                  </Button>
                </div>
              </form>
            )}
          </section>
        )}
      </Card>

      <Card testId="task-detail-view-history-card">
        <h3>{t('history-heading')}</h3>
        <HistoryTimeline
          entries={historyItems}
          statuses={statuses}
          hasMore={historyNextCursor !== null}
          isLoading={isLoading}
          onLoadMore={handleLoadMoreHistory}
          resolveAssigneeName={resolveAssigneeName}
        />
      </Card>
    </div>
  );
}
