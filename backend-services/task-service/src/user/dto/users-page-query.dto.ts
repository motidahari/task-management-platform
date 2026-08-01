import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Transport-validated pagination input for the user list. `limit` only
 * needs a positive-integer shape check here — how an absent or oversized
 * value resolves to an actual page size is `UserService`'s call, mirroring
 * `TasksPageQueryDto`. `cursor` is validated as a string only; its content
 * is opaque here and decoded (with its own malformed-input rejection) by
 * the DAO that actually walks it.
 */
export class UsersPageQueryDto {
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
