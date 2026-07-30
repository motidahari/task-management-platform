import { ValidationException } from '@core/shared';

/**
 * Constructor/setter input — everything a `Task` needs to exist, independent
 * of how it was obtained (a fresh creation, or hydration from a persisted row).
 */
export interface TaskProps {
  id: string;
  type: string;
  status: number;
  isClosed: boolean;
  assignedUserId: string;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A `Task` serialized for a client, with `statusName` resolved by the caller
 * (the service, via the task-type registry) rather than looked up here — the
 * model never reaches outside itself for context.
 */
export interface TaskSnapshot {
  readonly id: string;
  readonly type: string;
  readonly status: number;
  readonly statusName: string;
  readonly isClosed: boolean;
  readonly assignedUserId: string;
  readonly customFields: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Plain business object — framework-free, no persistence or registry
 * awareness. Cinema pattern: private fields behind getter/setter pairs that
 * validate on every assignment, so a `Task` instance that violates one of its
 * own invariants can never exist in memory, whichever code path built it
 * (a fresh creation or a DAO hydrating a row). Anything requiring outside
 * context (the registry, other rows, the database) is a business rule and
 * belongs one layer up, in the service — this class only ever inspects its
 * own fields.
 */
export class Task {
  private _id!: string;
  private _type!: string;
  private _status!: number;
  private _isClosed!: boolean;
  private _assignedUserId!: string;
  private _customFields!: Record<string, unknown>;
  private _createdAt!: Date;
  private _updatedAt!: Date;

  constructor(props: TaskProps) {
    this.id = props.id;
    this.type = props.type;
    this.status = props.status;
    this.isClosed = props.isClosed;
    this.assignedUserId = props.assignedUserId;
    this.customFields = props.customFields;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get id(): string {
    return this._id;
  }

  set id(value: string) {
    if (!isNonEmptyString(value)) {
      throw new ValidationException('Task id must be a non-empty string');
    }

    this._id = value;
  }

  get type(): string {
    return this._type;
  }

  set type(value: string) {
    if (!isNonEmptyString(value)) {
      throw new ValidationException('Task type must be a non-empty string');
    }

    this._type = value;
  }

  get status(): number {
    return this._status;
  }

  /**
   * `status >= 1` holds regardless of {@link isClosed} — a closed task's
   * status is validated through this same setter, so there is no separate
   * "closed task's status" rule to enforce elsewhere.
   */
  set status(value: number) {
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationException('Task status must be an integer of at least 1');
    }

    this._status = value;
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  set isClosed(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new ValidationException('Task isClosed must be a boolean');
    }

    this._isClosed = value;
  }

  get assignedUserId(): string {
    return this._assignedUserId;
  }

  set assignedUserId(value: string) {
    if (!isNonEmptyString(value)) {
      throw new ValidationException('Task assignedUserId must be a non-empty string');
    }

    this._assignedUserId = value;
  }

  get customFields(): Record<string, unknown> {
    return this._customFields;
  }

  set customFields(value: Record<string, unknown>) {
    if (!isPlainObject(value)) {
      throw new ValidationException('Task customFields must be an object');
    }

    this._customFields = value;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  set createdAt(value: Date) {
    if (!isValidDate(value)) {
      throw new ValidationException('Task createdAt must be a valid Date');
    }

    this._createdAt = value;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  set updatedAt(value: Date) {
    if (!isValidDate(value)) {
      throw new ValidationException('Task updatedAt must be a valid Date');
    }

    this._updatedAt = value;
  }

  toJSON(statusName: string): TaskSnapshot {
    return {
      id: this._id,
      type: this._type,
      status: this._status,
      statusName,
      isClosed: this._isClosed,
      assignedUserId: this._assignedUserId,
      customFields: this._customFields,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
