import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Transport-validated pagination input for one user's assigned-tasks page.
 * `limit` only needs a positive-integer shape check here — how an absent or
 * oversized value resolves to an actual page size is `TaskService`'s call,
 * mirroring `HistoryPageQueryDto`. `cursor` is validated as a string only;
 * its content is opaque here and decoded (with its own malformed-input
 * rejection) by the DAO that actually walks it.
 */
export class TasksPageQueryDto {
  @ApiPropertyOptional({ description: 'Filter to open (false) or closed (true) tasks only.' })
  @IsOptional()
  // Query params arrive as strings — `Boolean('anything-non-empty')` would
  // otherwise coerce `?isClosed=false` itself to `true`. Only the exact two
  // accepted literals are mapped; anything else passes through unchanged so
  // `@IsBoolean` rejects it instead of this transform silently swallowing it.
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;

    return value;
  })
  @IsBoolean()
  readonly isClosed?: boolean;

  @ApiPropertyOptional({ description: 'Page size. Defaults to 20, capped at 100.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page’s nextCursor.' })
  @IsOptional()
  @IsString()
  readonly cursor?: string;
}
