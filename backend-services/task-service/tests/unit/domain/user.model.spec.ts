import { ValidationException } from '@core/shared';

import { User, UserProps } from '../../../src/domain/user.model';

const REFERENCE_DATE = new Date('2026-07-30T12:00:00Z');

function validProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: REFERENCE_DATE,
    ...overrides,
  };
}

describe('User', () => {
  describe('Given:every field within its invariants, When:constructing', () => {
    it('should expose every field through its getter', () => {
      const user = new User(validProps());

      expect(user.id).toBe('user-1');
      expect(user.name).toBe('Ada Lovelace');
      expect(user.email).toBe('ada@example.com');
      expect(user.createdAt).toBe(REFERENCE_DATE);
    });
  });

  describe('Given:an empty id, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ id: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a whitespace-only id, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ id: '   ' }))).toThrow(ValidationException);
    });
  });

  describe('Given:an empty name, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ name: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:an email with no @, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ email: 'not-an-email' }))).toThrow(ValidationException);
    });
  });

  describe('Given:an email with no domain, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ email: 'ada@' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a non-Date createdAt, When:constructing', () => {
    it('should throw ValidationException', () => {
      const props = validProps();

      expect(() => new User({ ...props, createdAt: '2026-07-30' as unknown as Date })).toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:an invalid Date createdAt, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new User(validProps({ createdAt: new Date('not-a-date') }))).toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:a constructed user, When:assigning an invalid value through a setter', () => {
    it('should throw ValidationException and leave the previous value in place', () => {
      const user = new User(validProps());

      expect(() => {
        user.email = 'not-an-email';
      }).toThrow(ValidationException);
      expect(user.email).toBe('ada@example.com');
    });

    it('should accept a valid reassignment', () => {
      const user = new User(validProps());

      user.name = 'Grace Hopper';

      expect(user.name).toBe('Grace Hopper');
    });
  });

  describe('Given:a constructed user, When:serializing', () => {
    it('should include every field', () => {
      const user = new User(validProps());

      expect(user.toJSON()).toEqual({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        createdAt: REFERENCE_DATE,
      });
    });
  });
});
