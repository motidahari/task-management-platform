import { User } from '../domain/user.model';
import { UserResponseDto } from './dto/user-response.dto';

/**
 * The one place a `User` domain model becomes the wire response shape —
 * every endpoint that returns a user routes through this, so there is
 * exactly one spot that could ever get the shape wrong.
 */
export function toUserResponse(user: User): UserResponseDto {
  return user.toJSON();
}
