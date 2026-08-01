import { ApiProperty } from '@nestjs/swagger';

/**
 * The wire shape of one user resource — what every user endpoint that
 * returns a user (list, and the resolved-assignee context of a task page)
 * serializes to.
 */
export class UserResponseDto {
  @ApiProperty({ description: 'User id.' })
  readonly id!: string;

  @ApiProperty({ description: "The user's display name." })
  readonly name!: string;

  @ApiProperty({ description: "The user's email address." })
  readonly email!: string;

  @ApiProperty({ description: 'Creation timestamp.' })
  readonly createdAt!: Date;
}
