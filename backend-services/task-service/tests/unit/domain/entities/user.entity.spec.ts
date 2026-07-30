import { UserEntity } from '../../../../src/domain/entities/user.entity';
import {
  columnMetadataFor,
  databaseColumnName,
  resolvedDefault,
  tableMetadataFor,
} from './entity-metadata.helper';

describe('UserEntity', () => {
  describe('Given:the entity decorator, When:reading its table metadata', () => {
    it('should map to the users table', () => {
      expect(tableMetadataFor(UserEntity).name).toBe('users');
    });
  });

  describe('Given:the id column, When:reading its metadata', () => {
    it('should be a primary uuid defaulting to gen_random_uuid()', () => {
      const column = columnMetadataFor(UserEntity, 'id');

      expect(databaseColumnName(column)).toBe('id');
      expect(column.options.type).toBe('uuid');
      expect(column.options.primary).toBe(true);
      expect(resolvedDefault(column)).toBe('gen_random_uuid()');
    });
  });

  describe('Given:the name column, When:reading its metadata', () => {
    it('should be a required varchar(120)', () => {
      const column = columnMetadataFor(UserEntity, 'name');

      expect(databaseColumnName(column)).toBe('name');
      expect(column.options.type).toBe('varchar');
      expect(column.options.length).toBe(120);
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the email column, When:reading its metadata', () => {
    it('should be a required, unique varchar(255)', () => {
      const column = columnMetadataFor(UserEntity, 'email');

      expect(databaseColumnName(column)).toBe('email');
      expect(column.options.type).toBe('varchar');
      expect(column.options.length).toBe(255);
      expect(column.options.unique).toBe(true);
      expect(column.options.nullable).toBeFalsy();
    });
  });

  describe('Given:the createdAt column, When:reading its metadata', () => {
    it('should map to created_at, an auto-managed, timezone-aware creation timestamp', () => {
      const column = columnMetadataFor(UserEntity, 'createdAt');

      expect(databaseColumnName(column)).toBe('created_at');
      expect(column.mode).toBe('createDate');
      expect(column.options.type).toBe('timestamptz');
      expect(resolvedDefault(column)).toBe('now()');
    });
  });
});
