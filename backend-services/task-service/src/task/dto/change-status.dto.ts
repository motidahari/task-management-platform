import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Transport-validated input to change a task's status. The global
 * `ValidationPipe` rejects anything shaped wrong before this ever reaches
 * `TaskService` — by the time an instance reaches the service, every field
 * is trusted. `expectedStatus` is required, never defaulted: without it the
 * request is not safely retryable (see `TaskStateConflictException`).
 */
export class ChangeStatusDto {
  @ApiProperty({
    enum: ['forward', 'backward'],
    description: 'Which direction to move the task one status.',
  })
  @IsIn(['forward', 'backward'])
  readonly direction!: 'forward' | 'backward';

  @ApiProperty({
    description:
      "The status the client currently sees. Rejected with 409 if the task's actual status no longer matches.",
  })
  @IsInt()
  @Min(1)
  readonly expectedStatus!: number;

  @ApiProperty({ description: 'The user to assign the task to after this transition.' })
  @IsUUID()
  readonly nextAssignedUserId!: string;

  @ApiPropertyOptional({
    description:
      "Forward moves only: must satisfy exactly the target status's required fields. Ignored on a backward move.",
  })
  @IsOptional()
  @IsObject()
  readonly customFields?: Record<string, unknown>;
}
