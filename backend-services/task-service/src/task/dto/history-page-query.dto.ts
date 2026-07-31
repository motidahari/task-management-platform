import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Transport-validated pagination input for a task's history page. `limit`
 * only needs a positive-integer shape check here — how an absent or
 * oversized value resolves to an actual page size is `TaskService`'s call,
 * not something the transport layer rejects. `cursor` is validated as a
 * string only; its content is opaque here and decoded (with its own
 * malformed-input rejection) by the DAO that actually walks it.
 */
export class HistoryPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly limit?: number;

  @IsOptional()
  @IsString()
  readonly cursor?: string;
}
