import { TaskEntity } from '../../../../src/domain/entities/task.entity';
import {
  columnMetadataFor,
  databaseColumnName,
  resolvedDefault,
  tableMetadataFor,
} from './entity-metadata.helper';

describe('TaskEntity', () => {
  describe('Given:the entity decorator, When:reading its table metadata', () => {
    it('should map to the tasks table', () => {
      expect(tableMetadataFor(TaskEntity).name).toBe('tasks');
    });
  });

  describe('Given:the id column, When:reading its metadata', () => {
    it('should be a primary uuid defaulting to gen_random_uuid()', () => {
      const column = columnMetadataFor(TaskEntity, 'id');

      expect(databaseColumnName(column)).toBe('id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.primary).toBeTruthy();
      expect(resolvedDefault(column)).toBe('gen_random_uuid()');
    });
  });

  describe('Given:the type column, When:reading its metadata', () => {
    it('should be a plain, required varchar(50) — not an enum', () => {
      const column = columnMetadataFor(TaskEntity, 'type');

      expect(databaseColumnName(column)).toBe('type');
      expect(column.options.type).toBe('varchar');
      expect(column.options.length).toBe(50);
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the status column, When:reading its metadata', () => {
    it('should be a required int defaulting to 1', () => {
      const column = columnMetadataFor(TaskEntity, 'status');

      expect(databaseColumnName(column)).toBe('status');
      expect(column.options.type).toBe('int');
      expect(resolvedDefault(column)).toBe(1);
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the isClosed column, When:reading its metadata', () => {
    it('should map to is_closed, a required boolean defaulting to false', () => {
      const column = columnMetadataFor(TaskEntity, 'isClosed');

      expect(databaseColumnName(column)).toBe('is_closed');
      expect(column.options.type).toBe('boolean');
      expect(resolvedDefault(column)).toBe(false);
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the assignedUserId column, When:reading its metadata', () => {
    it('should map to assigned_user_id, a required uuid FK column', () => {
      const column = columnMetadataFor(TaskEntity, 'assignedUserId');

      expect(databaseColumnName(column)).toBe('assigned_user_id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the customFields column, When:reading its metadata', () => {
    it('should map to custom_fields, a required jsonb column defaulting to an empty object', () => {
      const column = columnMetadataFor(TaskEntity, 'customFields');

      expect(databaseColumnName(column)).toBe('custom_fields');
      expect(column.options.type).toBe('jsonb');
      expect(resolvedDefault(column)).toEqual({});
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the createdAt column, When:reading its metadata', () => {
    it('should map to created_at, an auto-managed creation timestamp', () => {
      const column = columnMetadataFor(TaskEntity, 'createdAt');

      expect(databaseColumnName(column)).toBe('created_at');
      expect(column.mode).toBe('createDate');
      expect(column.options.type).toBe('timestamptz');
      expect(resolvedDefault(column)).toBe('now()');
    });
  });

  describe('Given:the updatedAt column, When:reading its metadata', () => {
    it('should map to updated_at, an auto-managed update timestamp', () => {
      const column = columnMetadataFor(TaskEntity, 'updatedAt');

      expect(databaseColumnName(column)).toBe('updated_at');
      expect(column.mode).toBe('updateDate');
      expect(column.options.type).toBe('timestamptz');
    });
  });
});
