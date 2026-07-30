import { TaskStatusHistoryEntity } from '../../../../src/domain/entities/task-status-history.entity';
import {
  columnMetadataFor,
  databaseColumnName,
  resolvedDefault,
  tableMetadataFor,
} from './entity-metadata.helper';

describe('TaskStatusHistoryEntity', () => {
  describe('Given:the entity decorator, When:reading its table metadata', () => {
    it('should map to the task_status_history table', () => {
      expect(tableMetadataFor(TaskStatusHistoryEntity).name).toBe('task_status_history');
    });
  });

  describe('Given:the id column, When:reading its metadata', () => {
    it('should be part of the primary key, a uuid defaulting to gen_random_uuid()', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'id');

      expect(databaseColumnName(column)).toBe('id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.primary).toBeTruthy();
      expect(resolvedDefault(column)).toBe('gen_random_uuid()');
    });
  });

  describe('Given:the createdAt column, When:reading its metadata', () => {
    it('should also be part of the primary key, since the table is partitioned by created_at', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'createdAt');

      expect(databaseColumnName(column)).toBe('created_at');
      expect(column.options.primary).toBeTruthy();
      expect(column.options.type).toBe('timestamptz');
      expect(resolvedDefault(column)).toBe('now()');
    });
  });

  describe('Given:the id and createdAt columns together, When:reading the primary key shape', () => {
    it('should form exactly a two-column composite primary key', () => {
      const primaryColumnNames = [
        'id',
        'taskId',
        'fromStatus',
        'toStatus',
        'assignedUserId',
        'fieldsSnapshot',
        'createdAt',
      ]
        .map((propertyName) => columnMetadataFor(TaskStatusHistoryEntity, propertyName))
        .filter((column) => column.options.primary)
        .map((column) => column.propertyName);

      expect(primaryColumnNames).toEqual(['id', 'createdAt']);
    });
  });

  describe('Given:the taskId column, When:reading its metadata', () => {
    it('should map to task_id, a required uuid FK column', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'taskId');

      expect(databaseColumnName(column)).toBe('task_id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the fromStatus column, When:reading its metadata', () => {
    it('should map to from_status, a nullable int — null denotes task creation', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'fromStatus');

      expect(databaseColumnName(column)).toBe('from_status');
      expect(column.options.type).toBe('int');
      expect(column.options.nullable).toBeTruthy();
    });
  });

  describe('Given:the toStatus column, When:reading its metadata', () => {
    it('should map to to_status, a nullable int — null denotes the close transition', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'toStatus');

      expect(databaseColumnName(column)).toBe('to_status');
      expect(column.options.type).toBe('int');
      expect(column.options.nullable).toBeTruthy();
    });
  });

  describe('Given:the assignedUserId column, When:reading its metadata', () => {
    it('should map to assigned_user_id, a required uuid FK column', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'assignedUserId');

      expect(databaseColumnName(column)).toBe('assigned_user_id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the fieldsSnapshot column, When:reading its metadata', () => {
    it('should map to fields_snapshot, a required jsonb column defaulting to an empty object', () => {
      const column = columnMetadataFor(TaskStatusHistoryEntity, 'fieldsSnapshot');

      expect(databaseColumnName(column)).toBe('fields_snapshot');
      expect(column.options.type).toBe('jsonb');
      expect(resolvedDefault(column)).toEqual({});
      expect(column.options.nullable).toBeFalsy();
    });
  });
});
