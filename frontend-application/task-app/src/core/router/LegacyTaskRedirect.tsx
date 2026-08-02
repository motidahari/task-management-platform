import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';

import { useTaskStore } from '../../features/tasks/stores/useTaskStore';
import { Spinner } from '../../shared/components/Spinner';

/**
 * The pre-`/users/:userId` task link: it named a task but never a user, so
 * the only user a route in the new shape can name for it is the task's own
 * assignee. Resolves that from the task itself and replaces the URL rather
 * than rendering the task here, so a bookmark or shared link keeps landing on
 * the task instead of breaking; the resolve is a round trip, so it shows a
 * loading indicator meanwhile. A task that can't be loaded (deleted, or the id
 * was never valid) has no assignee to redirect into, so it falls back to the
 * root gate instead of a dead end.
 */
export function LegacyTaskRedirect(): ReactElement {
  const taskId = useParams<{ taskId: string }>().taskId ?? '';
  const fetchTask = useTaskStore((state) => state.fetchTask);
  const currentTask = useTaskStore((state) => state.currentTask);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setHasFailed(false);

    void fetchTask(taskId).then((succeeded) => {
      if (isCurrent && !succeeded) setHasFailed(true);
    });

    return () => {
      isCurrent = false;
    };
  }, [taskId, fetchTask]);

  if (hasFailed) return <Navigate to="/" replace />;

  if (currentTask?.id === taskId) {
    return <Navigate to={`/users/${currentTask.assignedUserId}/tasks/${taskId}`} replace />;
  }

  return <Spinner />;
}
