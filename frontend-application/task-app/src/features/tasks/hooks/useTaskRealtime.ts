import { useEffect } from 'react';

import { useBus } from '../../../core/bus/useBus';
import { realtimeService } from '../../../core/services/RealtimeService';
import { useTaskStore } from '../stores/useTaskStore';

/** A list view watches one user's assignments; a detail view watches one task. */
export type TaskRealtimeTarget =
  | { readonly mode: 'list'; readonly userId: string }
  | { readonly mode: 'detail'; readonly taskId: string };

/**
 * Wires the transport layer to the store for the lifetime of the owning
 * view: joins the room matching `target` on mount, leaves it on unmount, and
 * routes every task event straight to `applyTaskEvent` — this hook never
 * inspects a payload itself, the store owns the staleness guard and the
 * upsert/remove decision.
 *
 * `refetch` runs once whenever the bus reports the socket reconnected: any
 * event lost during the gap is gone for good (at-most-once delivery), so the
 * view closes that gap the same way it would after a manual refresh.
 */
export function useTaskRealtime(target: TaskRealtimeTarget, refetch: () => void): void {
  const bus = useBus();
  const applyTaskEvent = useTaskStore((state) => state.applyTaskEvent);
  const userId = target.mode === 'list' ? target.userId : undefined;
  const taskId = target.mode === 'detail' ? target.taskId : undefined;

  useEffect(() => {
    if (userId !== undefined) realtimeService.joinUser(userId);
    if (taskId !== undefined) realtimeService.joinTask(taskId);

    const unsubscribers = [
      realtimeService.on('task:created', applyTaskEvent),
      realtimeService.on('task:updated', applyTaskEvent),
      realtimeService.on('task:closed', applyTaskEvent),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (userId !== undefined) realtimeService.leaveUser(userId);
      if (taskId !== undefined) realtimeService.leaveTask(taskId);
    };
  }, [userId, taskId, applyTaskEvent]);

  useEffect(() => bus.on('realtime:reconnected', refetch), [bus, refetch]);
}
