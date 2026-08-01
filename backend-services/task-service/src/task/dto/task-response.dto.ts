import { ApiProperty } from '@nestjs/swagger';

/**
 * The wire shape of one task resource — what every task endpoint that
 * returns a task (create, get, change status, close) serializes to.
 * `updatedAt` is a fixed-length, microsecond-precision UTC ISO string rather
 * than a `Date`: the realtime staleness guard compares it lexicographically
 * against the socket payload's own copy, which only holds if both carry the
 * same, non-truncated precision.
 */
export class TaskResponseDto {
  @ApiProperty({ description: 'Task id.' })
  readonly id!: string;

  @ApiProperty({ description: 'Registered task-type key.' })
  readonly type!: string;

  @ApiProperty({ description: "The task's current status number, scoped to its type." })
  readonly status!: number;

  @ApiProperty({ description: "The current status's registered name." })
  readonly statusName!: string;

  @ApiProperty({ description: 'Whether the task has been closed.' })
  readonly isClosed!: boolean;

  @ApiProperty({ description: 'The user currently assigned to the task.' })
  readonly assignedUserId!: string;

  @ApiProperty({ description: 'Custom data the task has accumulated through its transitions.' })
  readonly customFields!: Record<string, unknown>;

  @ApiProperty({ description: 'Creation timestamp.' })
  readonly createdAt!: Date;

  @ApiProperty({
    description:
      'Last-update timestamp, as a fixed-length microsecond-precision UTC ISO string (YYYY-MM-DDTHH:mm:ss.ffffffZ).',
  })
  readonly updatedAt!: string;
}
