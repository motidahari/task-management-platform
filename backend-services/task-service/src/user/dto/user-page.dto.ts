import type { UserResponseDto } from './user-response.dto';

/** One keyset page of the user set, plus the limit actually applied (the caller's request may have been defaulted or clamped). */
export interface UserPageDto {
  readonly items: readonly UserResponseDto[];
  readonly nextCursor: string | null;
  readonly limit: number;
}
