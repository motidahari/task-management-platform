import {
  ALL_TASK_TYPE_DEFINITIONS,
  FieldDescriptor,
  NumberFieldDescriptor,
  StatusDefinition,
  StringFieldDescriptor,
  TaskTypeDefinition,
} from '../../../../src/task-type/interfaces/task-type-definition.interface';

describe('TaskTypeDefinition contract', () => {
  describe('Given:the injection token, When:reading its value', () => {
    it('should be a symbol usable as a DI key', () => {
      expect(typeof ALL_TASK_TYPE_DEFINITIONS).toBe('symbol');
    });
  });

  describe('Given:a string field descriptor, When:constructed with its required maxLength', () => {
    it('should keep pattern optional', () => {
      const bounded: StringFieldDescriptor = {
        key: 'quote1',
        label: 'Price quote 1',
        fieldType: 'string',
        maxLength: 500,
      };
      const withPattern: StringFieldDescriptor = {
        key: 'versionNumber',
        label: 'Version number',
        fieldType: 'string',
        maxLength: 50,
        pattern: '^\\d+\\.\\d+\\.\\d+$',
      };

      expect(bounded.pattern).toBeUndefined();
      expect(withPattern.pattern).toBe('^\\d+\\.\\d+\\.\\d+$');
    });

    it('should fail to compile without maxLength', () => {
      // @ts-expect-error maxLength is required on a string field
      const missingMaxLength: StringFieldDescriptor = {
        key: 'quote1',
        label: 'Price quote 1',
        fieldType: 'string',
      };

      expect(missingMaxLength).toBeDefined();
    });

    it('should fail to compile with a numeric-only constraint', () => {
      const illegal: StringFieldDescriptor = {
        key: 'quote1',
        label: 'Price quote 1',
        fieldType: 'string',
        maxLength: 500,
        // @ts-expect-error min does not exist on a string field
        min: 1,
      };

      expect(illegal).toBeDefined();
    });
  });

  describe('Given:a number field descriptor, When:constructed with no bounds', () => {
    it('should keep min and max optional', () => {
      const unbounded: NumberFieldDescriptor = {
        key: 'quantity',
        label: 'Quantity',
        fieldType: 'number',
      };
      const bounded: NumberFieldDescriptor = {
        key: 'quantity',
        label: 'Quantity',
        fieldType: 'number',
        min: 1,
        max: 100,
      };

      expect(unbounded.min).toBeUndefined();
      expect(bounded.max).toBe(100);
    });

    it('should fail to compile with a string-only constraint', () => {
      const illegal: NumberFieldDescriptor = {
        key: 'quantity',
        label: 'Quantity',
        fieldType: 'number',
        // @ts-expect-error maxLength does not exist on a number field
        maxLength: 10,
      };

      expect(illegal).toBeDefined();
    });
  });

  describe('Given:a list of field descriptors, When:narrowing by fieldType', () => {
    it('should expose only the members valid for the discriminated branch', () => {
      const fields: FieldDescriptor[] = [
        { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 500 },
        { key: 'quantity', label: 'Quantity', fieldType: 'number', min: 0, max: 10 },
      ];

      for (const field of fields) {
        if (field.fieldType === 'string') {
          expect(field.maxLength).toBe(500);
        } else {
          expect(field.max).toBe(10);
        }
      }
    });
  });

  describe('Given:a status definition, When:constructed with its required fields', () => {
    it('should carry an ordered list of field descriptors', () => {
      const status: StatusDefinition = {
        status: 2,
        name: 'supplier-offers-received',
        displayName: 'Supplier offers received',
        requiredFields: [
          { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 500 },
        ],
      };

      expect(status.requiredFields).toHaveLength(1);
    });
  });

  describe('Given:a task type definition, When:constructed with an ordered status list', () => {
    it('should have no finalStatus field of its own', () => {
      const definition: TaskTypeDefinition = {
        type: 'procurement',
        displayName: 'Procurement',
        statuses: [
          { status: 1, name: 'created', displayName: 'Created', requiredFields: [] },
          {
            status: 2,
            name: 'purchase-completed',
            displayName: 'Purchase completed',
            requiredFields: [
              { key: 'receipt', label: 'Receipt', fieldType: 'string', maxLength: 500 },
            ],
          },
        ],
      };

      expect('finalStatus' in definition).toBe(false);
      expect(definition.statuses[definition.statuses.length - 1]?.name).toBe('purchase-completed');
    });
  });
});
