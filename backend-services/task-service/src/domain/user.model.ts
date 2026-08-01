import { EMAIL_PATTERN, isValidDate, isValidString, ValidationException } from '@core/shared';

/**
 * Constructor/setter input — everything a `User` needs to exist, independent
 * of how it was obtained (a fresh creation, or hydration from a persisted row).
 */
export interface UserProps {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/** A `User` serialized for a client. */
export interface UserSnapshot {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: Date;
}

/**
 * Plain business object — framework-free, no persistence awareness. Cinema
 * pattern: private fields behind getter/setter pairs that validate on every
 * assignment, so a `User` instance that violates one of its own invariants
 * can never exist in memory, whichever code path built it (a fresh creation
 * or a DAO hydrating a row).
 */
export class User {
  private _id!: string;
  private _name!: string;
  private _email!: string;
  private _createdAt!: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.createdAt = props.createdAt;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    if (!isValidString(value)) {
      throw new ValidationException('User id must be a non-empty string');
    }

    this._id = value;
  }

  get name(): string {
    return this._name;
  }

  set name(value: string) {
    if (!isValidString(value)) {
      throw new ValidationException('User name must be a non-empty string');
    }

    this._name = value;
  }

  get email(): string {
    return this._email;
  }

  set email(value: string) {
    if (!isValidString(value, { pattern: EMAIL_PATTERN })) {
      throw new ValidationException('User email must be a valid email address');
    }

    this._email = value;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  set createdAt(value: Date) {
    if (!isValidDate(value)) {
      throw new ValidationException('User createdAt must be a valid Date');
    }

    this._createdAt = value;
  }

  toJSON(): UserSnapshot {
    return {
      id: this._id,
      name: this._name,
      email: this._email,
      createdAt: this._createdAt,
    };
  }
}
