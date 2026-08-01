import { User } from '../../../src/domain/user.model';
import { toUserResponse } from '../../../src/user/user-response.mapper';

function fakeUser(): User {
  return new User({
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: new Date('2026-07-30T12:00:00.000Z'),
  });
}

describe('toUserResponse', () => {
  describe('Given:a user domain model, When:mapping to the wire shape', () => {
    it('should carry every field unchanged', () => {
      const result = toUserResponse(fakeUser());

      expect(result).toEqual({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: new Date('2026-07-30T12:00:00.000Z'),
      });
    });
  });
});
