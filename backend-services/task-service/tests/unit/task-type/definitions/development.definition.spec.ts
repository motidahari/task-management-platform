import { DevelopmentDefinition } from '../../../../src/task-type/definitions/development.definition';
import { StringFieldDescriptor } from '../../../../src/task-type/interfaces/task-type-definition.interface';

describe('DevelopmentDefinition', () => {
  const definition = new DevelopmentDefinition();

  describe('Given:the definition, When:reading its type identity', () => {
    it('should expose the development type key and display name', () => {
      expect(definition.type).toBe('development');
      expect(definition.displayName).toBe('Development');
    });
  });

  describe('Given:the status list, When:reading its length and ordering', () => {
    it('should have four statuses numbered contiguously from 1', () => {
      expect(definition.statuses).toHaveLength(4);
      expect(definition.statuses.map((status) => status.status)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Given:status 1 (created), When:reading its shape', () => {
    it('should require no fields', () => {
      const created = definition.statuses[0];

      expect(created).toEqual({
        status: 1,
        name: 'created',
        displayName: 'Created',
        requiredFields: [],
      });
    });
  });

  describe('Given:status 2 (specification-completed), When:reading its shape', () => {
    it('should require a bounded specification string', () => {
      const specificationCompleted = definition.statuses[1];

      expect(specificationCompleted).toEqual({
        status: 2,
        name: 'specification-completed',
        displayName: 'Specification completed',
        requiredFields: [
          { key: 'specification', label: 'Specification', fieldType: 'string', maxLength: 5000 },
        ],
      });
    });
  });

  describe('Given:status 3 (development-completed), When:reading its shape', () => {
    it('should require a bounded branch-name string', () => {
      const developmentCompleted = definition.statuses[2];

      expect(developmentCompleted).toEqual({
        status: 3,
        name: 'development-completed',
        displayName: 'Development completed',
        requiredFields: [
          { key: 'branchName', label: 'Branch name', fieldType: 'string', maxLength: 255 },
        ],
      });
    });
  });

  describe('Given:status 4 (distribution-completed), When:reading its shape', () => {
    it('should require a pattern-validated version-number string', () => {
      const distributionCompleted = definition.statuses[3];

      expect(distributionCompleted).toEqual({
        status: 4,
        name: 'distribution-completed',
        displayName: 'Distribution completed',
        requiredFields: [
          {
            key: 'versionNumber',
            label: 'Version number',
            fieldType: 'string',
            maxLength: 50,
            pattern: '^\\d+\\.\\d+\\.\\d+$',
          },
        ],
      });
    });

    it('should accept dotted semantic versions and reject malformed ones', () => {
      const versionField = distributionField(definition);
      const versionPattern = new RegExp(versionField.pattern ?? '');

      expect(versionPattern.test('1.4.2')).toBe(true);
      expect(versionPattern.test('1.4')).toBe(false);
      expect(versionPattern.test('v1.4.2')).toBe(false);
    });
  });
});

function distributionField(definition: DevelopmentDefinition): StringFieldDescriptor {
  const distributionCompleted = definition.statuses[3];
  const [versionField] = distributionCompleted.requiredFields;

  if (!versionField || versionField.fieldType !== 'string') {
    throw new Error('expected versionNumber to be a string field descriptor');
  }

  return versionField;
}
