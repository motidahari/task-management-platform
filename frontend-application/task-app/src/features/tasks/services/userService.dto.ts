import type { User } from '../types';

/** Opaque, server-issued keyset cursor — the client only ever passes it back verbatim. */
export type UserListPage = Readonly<{
  items: readonly User[];
  nextCursor: string | null;
  limit: number;
}>;

export interface ListUsersParams {
  readonly limit?: number;
  readonly cursor?: string;
}
