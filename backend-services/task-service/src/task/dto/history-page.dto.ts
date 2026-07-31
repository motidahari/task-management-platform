/**
 * One transition on the wire — `fromStatus: null` marks a task's creation,
 * `toStatus: null` marks its close, matching the convention the history
 * table itself was built on.
 */
export interface HistoryEntryDto {
  readonly fromStatus: number | null;
  readonly toStatus: number | null;
  readonly assignedUserId: string;
  readonly fieldsSnapshot: Record<string, unknown>;
  readonly createdAt: Date;
}

/** One keyset page of a task's history, plus the limit actually applied (the caller's request may have been defaulted or clamped). */
export interface HistoryPageDto {
  readonly items: readonly HistoryEntryDto[];
  readonly nextCursor: string | null;
  readonly limit: number;
}
