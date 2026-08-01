import { ValidationException } from '@core/shared';

import { Task, TaskProps } from '../../../src/domain/task.model';

const REFERENCE_DATE = new Date('2026-07-30T12:00:00Z');
const REFERENCE_UPDATED_AT = '2026-07-30T12:00:00.000000Z';

function validProps(overrides: Partial<TaskProps> = {}): TaskProps {
  return {
    id: 'task-1',
    type: 'procurement',
    status: 1,
    isClosed: false,
    assignedUserId: 'user-1',
    customFields: {},
    createdAt: REFERENCE_DATE,
    updatedAt: REFERENCE_UPDATED_AT,
    ...overrides,
  };
}

describe('Task', () => {
  describe('Given:every field within its invariants, When:constructing', () => {
    it('should expose every field through its getter', () => {
      const task = new Task(validProps());

      expect(task.id).toBe('task-1');
      expect(task.type).toBe('procurement');
      expect(task.status).toBe(1);
      expect(task.isClosed).toBe(false);
      expect(task.assignedUserId).toBe('user-1');
      expect(task.customFields).toEqual({});
      expect(task.createdAt).toBe(REFERENCE_DATE);
      expect(task.updatedAt).toBe(REFERENCE_UPDATED_AT);
    });
  });

  describe('Given:an empty id, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ id: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a whitespace-only id, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ id: '   ' }))).toThrow(ValidationException);
    });
  });

  describe('Given:an empty type, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ type: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a status below 1, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ status: 0 }))).toThrow(ValidationException);
    });
  });

  describe('Given:a non-integer status, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ status: 1.5 }))).toThrow(ValidationException);
    });
  });

  describe('Given:a non-boolean isClosed, When:constructing', () => {
    it('should throw ValidationException', () => {
      const props = validProps();

      expect(() => new Task({ ...props, isClosed: 'true' as unknown as boolean })).toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:an empty assignedUserId, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ assignedUserId: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a null customFields, When:constructing', () => {
    it('should throw ValidationException', () => {
      const props = validProps();

      expect(
        () => new Task({ ...props, customFields: null as unknown as Record<string, unknown> }),
      ).toThrow(ValidationException);
    });
  });

  describe('Given:an array customFields, When:constructing', () => {
    it('should throw ValidationException', () => {
      const props = validProps();

      expect(
        () => new Task({ ...props, customFields: [] as unknown as Record<string, unknown> }),
      ).toThrow(ValidationException);
    });
  });

  describe('Given:a non-Date createdAt, When:constructing', () => {
    it('should throw ValidationException', () => {
      const props = validProps();

      expect(() => new Task({ ...props, createdAt: '2026-07-30' as unknown as Date })).toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:an invalid Date createdAt, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ createdAt: new Date('not-a-date') }))).toThrow(
        ValidationException,
      );
    });
  });

  describe('Given:an empty updatedAt, When:constructing', () => {
    it('should throw ValidationException', () => {
      expect(() => new Task(validProps({ updatedAt: '' }))).toThrow(ValidationException);
    });
  });

  describe('Given:a constructed task, When:assigning an invalid value through a setter', () => {
    it('should throw ValidationException and leave the previous value in place', () => {
      const task = new Task(validProps());

      expect(() => {
        task.status = 0;
      }).toThrow(ValidationException);
      expect(task.status).toBe(1);
    });

    it('should accept a valid reassignment', () => {
      const task = new Task(validProps());

      task.status = 2;

      expect(task.status).toBe(2);
    });
  });

  describe('Given:a closed task, When:constructing', () => {
    it('should still require status to be a positive integer', () => {
      expect(() => new Task(validProps({ isClosed: true, status: 0 }))).toThrow(
        ValidationException,
      );
    });

    it('should construct successfully when status is a positive integer', () => {
      const task = new Task(validProps({ isClosed: true, status: 3 }));

      expect(task.isClosed).toBe(true);
      expect(task.status).toBe(3);
    });
  });

  describe('Given:a constructed task, When:serializing with a resolved status name', () => {
    it('should include every field plus the passed-in statusName', () => {
      const task = new Task(validProps({ customFields: { quote1: '100 USD' } }));

      expect(task.toJSON('supplier-offers-received')).toEqual({
        id: 'task-1',
        type: 'procurement',
        status: 1,
        statusName: 'supplier-offers-received',
        isClosed: false,
        assignedUserId: 'user-1',
        customFields: { quote1: '100 USD' },
        createdAt: REFERENCE_DATE,
        updatedAt: REFERENCE_UPDATED_AT,
      });
    });
  });
});
