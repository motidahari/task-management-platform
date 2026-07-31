/**
 * Single source for realtime room names. Both the gateway (client joins) and
 * the publisher (server emits) must agree on the exact string, so the naming
 * lives here once rather than being reconstructed in two places that could
 * silently drift apart.
 */

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function taskRoom(taskId: string): string {
  return `task:${taskId}`;
}
