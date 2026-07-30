import type { Request } from 'express';

/** Express types `req.route` as `any` — narrow it explicitly before reading it. */
interface RouteLike {
  readonly path?: string;
}

/**
 * The matched route template (e.g. `/tasks/:id/status`) when the router has
 * resolved one, falling back to the raw URL otherwise. Callers that label
 * logs or metrics by route need the template, never the raw URL — a raw URL
 * carries unbounded path parameters (task ids, etc.) that would blow up
 * either one's cardinality.
 */
export function routePathOf(req: Request): string {
  const route = req.route as RouteLike | undefined;

  return route?.path ?? req.originalUrl;
}
