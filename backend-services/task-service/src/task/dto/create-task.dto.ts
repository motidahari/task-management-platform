import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/**
 * Transport-validated input to create a task. The global `ValidationPipe`
 * rejects anything shaped wrong before this ever reaches `TaskService` — by
 * the time an instance reaches the service, both fields are trusted.
 */
export class CreateTaskDto {
  @ApiProperty({ description: 'Registered task-type key.' })
  @IsString()
  @IsNotEmpty()
  readonly type!: string;

  @ApiProperty({ description: 'The user to assign the new task to.' })
  @IsUUID()
  readonly assignedUserId!: string;
}
