import { Logger } from '@core/shared';
import { Injectable, Optional } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway';
import { taskRoom, userRoom } from './rooms';

export type TaskEventName = 'task:created' | 'task:updated' | 'task:closed';

/**
 * Full task resource, same shape as the REST response — a diff would force
 * every client to hold and patch state correctly, while the full resource
 * makes each event idempotent regardless of ordering. `id` and
 * `assignedUserId` are pulled out because room targeting needs them; the
 * rest of the resource is opaque to this module on purpose (constructing it
 * — including the microsecond-precision `updatedAt` — is the caller's job,
 * not this leaf side-effect port's).
 */
export interface TaskEventResource {
  readonly id: string;
  readonly assignedUserId: string;
  readonly [key: string]: unknown;
}

export interface TaskEventPayload {
  readonly task: TaskEventResource;
  readonly updatedAt: string;
}

/**
 * The single place that emits realtime task events. Owns room targeting
 * (task room, the current assignee's room, and — on reassignment — the
 * previous assignee's room) so callers never touch socket internals
 * directly, mirroring the single-write-funnel principle on the read side.
 *
 * Intended to run only after the triggering mutation has committed: the
 * emit is wrapped in its own try/catch that logs and swallows, because a
 * delivery failure here must never fail a mutation that has already
 * committed — the one sanctioned swallow in this codebase.
 */
@Injectable()
export class TaskEventsPublisher {
  constructor(
    private readonly gateway: RealtimeGateway,
    @Optional() private readonly logger: Logger = new Logger(TaskEventsPublisher.name),
  ) {}

  /**
   * @param previousAssigneeId the assignee before this mutation, only when
   *   it changed. Omit for a create, a status change with no reassignment,
   *   or a close — see {@link targetRooms} for the exact matrix.
   */
  publish(event: TaskEventName, payload: TaskEventPayload, previousAssigneeId?: string): void {
    try {
      const rooms = this.targetRooms(payload.task, previousAssigneeId);

      this.gateway.namespace.to(rooms).emit(event, payload);
    } catch (error) {
      this.logger.error('Failed to publish task event — delivery is at-most-once by design', {
        event,
        taskId: payload.task.id,
        error,
      });
    }
  }

  private targetRooms(task: TaskEventResource, previousAssigneeId?: string): string[] {
    const rooms = [taskRoom(task.id), userRoom(task.assignedUserId)];
    const assigneeChanged =
      previousAssigneeId !== undefined && previousAssigneeId !== task.assignedUserId;

    if (assigneeChanged) {
      rooms.push(userRoom(previousAssigneeId));
    }

    return rooms;
  }
}
