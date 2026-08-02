import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

import { useBus } from '../../../core/bus/useBus';
import type { ApiError } from '../../../core/types/api-error';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Drawer } from '../../../shared/components/Drawer';
import { EmptyState } from '../../../shared/components/EmptyState';
import type { SelectOption } from '../../../shared/components/Select';
import { Skeleton } from '../../../shared/components/Skeleton';
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
 * Every status change hands the task to one of the seeded users, so the
 * picker offers the full directory rather than only the people this task
 * has already touched — reused as-is from the store, no separate request.
 * The task's current assignee is added too, in case it fell out of the
 * directory (a user seeded away since), so it stays selectable and keeps
 * showing its resolved name — or the raw id, past that fallback.
 */
function collectAssigneeOptions(
  task: Task,
  users: readonly User[],
  resolveAssigneeName: (userId: string) => string,
): SelectOption[] {
  const ids = new Set([task.assignedUserId, ...users.map((user) => user.id)]);
  return Array.from(ids).map((id) => ({ value: id, label: resolveAssigneeName(id) }));
}

function extractMissingFields(error: ApiError | null): readonly string[] {
  if (!error?.details || !('missing' in error.details)) return [];
  return error.details.missing ?? [];
}

/**
 * A route-driven drawer over the still-mounted task table: the stepper, the
 * task's read-only saved fields, its audit-trail timeline, and the
 * always-visible next-status panel — advance/reverse/close all wired to one
 * task's live state. Every mutation (via `useTaskLifecycle`) already carries
 * `expectedStatus`, so a stale conflict resolves itself: the store
 * refetches, `currentTask` changes, and the effect below clears whatever was
 * entered and lands the screen on the true state — no bespoke conflict
 * handling lives here.
 */
export function TaskDetailView(): ReactElement {
  const taskId = useParams<{ taskId: string }>().taskId ?? '';
  const navigate = useNavigate();
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
  const loadTaskTypes = useTaskTypeStore((state) => state.loadTaskTypes);
  const users = useCurrentUserStore((state) => state.users);
  const fetchUsers = useCurrentUserStore((state) => state.fetchUsers);
  const lifecycle = useTaskLifecycle();

  const [customFieldValues, setCustomFieldValues] = useState<DynamicFieldsFormValues>({});
  const [nextAssignedUserId, setNextAssignedUserId] = useState('');
  const [missingFieldKeys, setMissingFieldKeys] = useState<readonly string[]>([]);

  const refetch = useCallback(() => {
    if (taskId !== '') void fetchTask(taskId);
  }, [taskId, fetchTask]);

  const closeDrawer = useCallback(() => void navigate('/'), [navigate]);

  // An unresolved type means the metadata itself is stale or incomplete, not
  // the task — refetching the task alone could never fix it, so this reloads
  // the definitions the same way `TaskTypesGate` does, alongside the task in
  // case its `type` field was also wrong.
  const retryTypeResolution = useCallback(() => {
    void loadTaskTypes();
    refetch();
  }, [loadTaskTypes, refetch]);

  useTaskRealtime({ mode: 'detail', taskId }, refetch);

  useEffect(() => {
    if (taskId === '') return;
    void fetchTask(taskId);
  }, [taskId, fetchTask]);

  // Every transition appends to the audit trail, so the timeline follows the
  // loaded task's state rather than only its id: it arrives with the first
  // load and refreshes on any later move, including one made elsewhere and
  // delivered over the socket.
  const loadedStatus = currentTask?.status;
  const loadedIsClosed = currentTask?.isClosed;
  useEffect(() => {
    if (taskId === '' || loadedStatus === undefined) return;
    void fetchTaskHistory(taskId);
  }, [taskId, loadedStatus, loadedIsClosed, fetchTaskHistory]);

  // A user landing here directly (rather than via `MyTasksView`) has no
  // directory loaded yet; one arriving from the picker already does, so this
  // never re-fetches on top of it.
  useEffect(() => {
    if (users.length === 0) void fetchUsers();
  }, [users.length, fetchUsers]);

  // A task change (a successful mutation, or the auto-refetch that follows a
  // TASK_STATE_CONFLICT) always makes whatever was entered stale — the next
  // status, and so its required fields, may no longer be the same one, so
  // this is the one place both the entered values and any missing-field
  // highlight get cleared, for either recovery path.
  useEffect(() => {
    setCustomFieldValues({});
    setMissingFieldKeys([]);
    setNextAssignedUserId(currentTask?.assignedUserId ?? '');
  }, [currentTask?.id, currentTask?.status]);

  // `details.missing` only ever applies to the advance panel's fields.
  useEffect(() => {
    setMissingFieldKeys(extractMissingFields(error));
  }, [error]);

  const taskTypeDef = useMemo(
    () => (currentTask ? findTaskType(taskTypeDefinitions, currentTask.type) : undefined),
    [taskTypeDefinitions, currentTask],
  );
  const statuses = taskTypeDef?.statuses ?? [];
  // Covers both an unknown type and one that resolved with an empty
  // `statuses` array — either way there is no workflow to derive actions
  // from, so this is checked once and used to swap the whole action column
  // for an explicit error instead of leaving `canAdvance`/`canReverse`/
  // `canClose` silently false.
  const isTypeMetadataUnresolved = statuses.length === 0;
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

  const assigneeOptions = useMemo(
    () => (currentTask ? collectAssigneeOptions(currentTask, users, resolveAssigneeName) : []),
    [currentTask, users, resolveAssigneeName],
  );

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

  async function handleReverseClick(): Promise<void> {
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

  if (!currentTask) {
    return (
      <Drawer title={t('title-fallback')} onClose={closeDrawer} testId="task-detail-view">
        {error ? (
          <div className="task-detail-view__error" role="alert">
            <p className="task-detail-view__error-message">
              {resolveErrorText(error, translateRaw)}
            </p>
            <Button onClick={refetch} testId="task-detail-view-retry">
              {t('retry-button')}
            </Button>
          </div>
        ) : (
          <div className="task-detail-view__loading" data-testid="task-detail-view-loading">
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="block" height={140} />
            <Skeleton variant="text" count={3} />
          </div>
        )}
      </Drawer>
    );
  }

  return (
    <Drawer
      title={taskTypeDef?.displayName ?? currentTask.type}
      onClose={closeDrawer}
      testId="task-detail-view"
    >
      <div className="task-detail-view__columns">
        <div className="task-detail-view__column task-detail-view__column--left">
          <Badge variant={currentTask.isClosed ? 'neutral' : 'success'}>
            {currentTask.isClosed ? t('state-closed') : t('state-open')}
          </Badge>

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

          <section aria-label={t('history-heading')} className="task-detail-view__history">
            <h3>{t('history-heading')}</h3>
            <HistoryTimeline
              entries={historyItems}
              statuses={statuses}
              hasMore={historyNextCursor !== null}
              isLoading={isLoading}
              onLoadMore={handleLoadMoreHistory}
              resolveAssigneeName={resolveAssigneeName}
            />
          </section>
        </div>

        <div className="task-detail-view__column task-detail-view__column--right">
          {isTypeMetadataUnresolved ? (
            <div className="task-detail-view__type-error" role="alert">
              <EmptyState
                icon="alert"
                title={t('type-unresolved-title', { type: currentTask.type })}
                description={t('type-unresolved-description')}
                action={
                  <Button onClick={retryTypeResolution} testId="task-detail-view-type-error-retry">
                    {t('retry-button')}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <StatusStepper
                statuses={statuses}
                currentStatus={currentTask.status}
                isClosed={currentTask.isClosed}
              />

              {!currentTask.isClosed && (
                <section
                  className="task-detail-view__mutation"
                  data-testid="task-detail-view-actions"
                >
                  <form
                    className="task-detail-view__form"
                    data-testid="advance-form"
                    onSubmit={(event) => void submitAdvance(event)}
                  >
                    {nextStatusDef ? (
                      <div className="task-detail-view__panel">
                        <h3 className="task-detail-view__panel-heading">
                          {t('next-status-heading', { status: nextStatusDef.displayName })}
                        </h3>
                        <DynamicFieldsForm
                          descriptors={nextStatusDef.requiredFields}
                          values={customFieldValues}
                          onChange={(key, value) =>
                            setCustomFieldValues((current) => ({ ...current, [key]: value }))
                          }
                          missingFields={missingFieldKeys}
                          disabled={lifecycle.isSubmitting}
                        />
                      </div>
                    ) : (
                      <EmptyState
                        icon="check"
                        title={t('final-status-title')}
                        description={t('final-status-description')}
                      />
                    )}

                    <AssigneeSelect
                      value={nextAssignedUserId}
                      options={assigneeOptions}
                      onChange={setNextAssignedUserId}
                      disabled={lifecycle.isSubmitting}
                    />

                    {/* Only the moves this task can actually make are offered:
                        a permanently dead control reads as a broken screen. */}
                    <div className="task-detail-view__action-row">
                      {canAdvance && (
                        <Button
                          type="submit"
                          loading={lifecycle.isSubmitting}
                          testId="advance-submit"
                        >
                          {t('advance-button')}
                        </Button>
                      )}
                      {canReverse && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleReverseClick()}
                          disabled={lifecycle.isSubmitting}
                          testId="reverse-submit"
                        >
                          {t('reverse-button')}
                        </Button>
                      )}
                      {canClose && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={handleCloseClick}
                          testId="close-button"
                        >
                          {t('close-button')}
                        </Button>
                      )}
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}
