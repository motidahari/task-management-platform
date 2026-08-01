import type { TaskResponseDto } from './task-response.dto';

/** One keyset page of a user's assigned tasks, plus the limit actually applied (the caller's request may have been defaulted or clamped). */
export interface TaskPageDto {
  readonly items: readonly TaskResponseDto[];
  readonly nextCursor: string | null;
  readonly limit: number;
}
