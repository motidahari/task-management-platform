import type { DataSource } from 'typeorm';

import {
  TaskTypeRegistry,
  TaskTypeRegistryValidationError,
} from '../../../src/task-type/task-type.registry';
import { TaskTypeDefinition } from '../../../src/task-type/interfaces/task-type-definition.interface';

function widgetDefinition(overrides: Partial<TaskTypeDefinition> = {}): TaskTypeDefinition {
  return {
    type: 'widget',
    displayName: 'Widget',
    statuses: [
      { status: 1, name: 'created', displayName: 'Created', requiredFields: [] },
      {
        status: 2,
        name: 'assembled',
        displayName: 'Assembled',
        requiredFields: [
          { key: 'serialNumber', label: 'Serial number', fieldType: 'string', maxLength: 50 },
        ],
      },
      {
        status: 3,
        name: 'shipped',
        displayName: 'Shipped',
        requiredFields: [
          { key: 'trackingCode', label: 'Tracking code', fieldType: 'string', maxLength: 50 },
        ],
      },
    ],
    ...overrides,
  };
}

function fakeDataSource(rows: ReadonlyArray<{ type: string }> = []): DataSource {
  return { query: jest.fn().mockResolvedValue(rows) } as unknown as DataSource;
}

function registryWith(
  definitions: readonly TaskTypeDefinition[],
  persistedTypeRows: ReadonlyArray<{ type: string }> = [],
): TaskTypeRegistry {
  return new TaskTypeRegistry([...definitions], fakeDataSource(persistedTypeRows));
}

describe('TaskTypeRegistry', () => {
  describe('Given:a single self-consistent definition whose persisted types are all registered, When:onModuleInit runs', () => {
    it('should resolve without throwing', async () => {
      const registry = registryWith([widgetDefinition()], [{ type: 'widget' }]);

      await expect(registry.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('Given:two definitions registered under the same type key, When:onModuleInit runs', () => {
    it('should reject with the duplicated type named in the error', async () => {
      const registry = registryWith([widgetDefinition(), widgetDefinition()]);

      await expect(registry.onModuleInit()).rejects.toThrow(TaskTypeRegistryValidationError);
      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task type "widget" is registered more than once.',
      );
    });
  });

  describe('Given:a definition whose statuses skip a number, When:onModuleInit runs', () => {
    it('should reject rather than let the gap through', async () => {
      const definition = widgetDefinition();
      const statusesWithGap = [
        definition.statuses[0]!,
        { ...definition.statuses[1]!, status: 3 },
        { ...definition.statuses[2]!, status: 4 },
      ];

      const registry = registryWith([{ ...definition, statuses: statusesWithGap }]);

      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task type "widget" statuses must be contiguous ascending from 1 (found: 1, 3, 4).',
      );
    });
  });

  describe('Given:a definition whose status 1 declares required fields, When:onModuleInit runs', () => {
    it('should reject since creation carries no custom data', async () => {
      const definition = widgetDefinition();
      const creationStatusWithFields = {
        ...definition.statuses[0]!,
        requiredFields: [
          { key: 'requester', label: 'Requester', fieldType: 'string' as const, maxLength: 100 },
        ],
      };

      const registry = registryWith([
        { ...definition, statuses: [creationStatusWithFields, ...definition.statuses.slice(1)] },
      ]);

      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task type "widget" status 1 must not declare required fields',
      );
    });
  });

  describe('Given:a definition that reuses the same field key across two statuses, When:onModuleInit runs', () => {
    it('should reject the duplicated field key', async () => {
      const definition = widgetDefinition();
      const shippedStatusReusingKey = {
        ...definition.statuses[2]!,
        requiredFields: [
          {
            key: 'serialNumber',
            label: 'Serial number',
            fieldType: 'string' as const,
            maxLength: 50,
          },
        ],
      };

      const registry = registryWith([
        { ...definition, statuses: [...definition.statuses.slice(0, 2), shippedStatusReusingKey] },
      ]);

      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task type "widget" declares field key "serialNumber" in more than one status.',
      );
    });
  });

  describe('Given:a definition with a blank displayName, When:onModuleInit runs', () => {
    it('should reject the empty display string', async () => {
      const registry = registryWith([widgetDefinition({ displayName: '   ' })]);

      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task type "widget" has an empty displayName.',
      );
    });
  });

  describe('Given:the database references a type no definition declares, When:onModuleInit runs', () => {
    it('should reject listing the orphaned type', async () => {
      const registry = registryWith(
        [widgetDefinition()],
        [{ type: 'widget' }, { type: 'retired-type' }],
      );

      await expect(registry.onModuleInit()).rejects.toThrow(TaskTypeRegistryValidationError);
      await expect(registry.onModuleInit()).rejects.toThrow(
        'Task rows exist for type(s) no longer registered: retired-type.',
      );
    });
  });

  describe('Given:a registered type with multiple statuses, When:deriving its final status', () => {
    it('should return the status number of the last entry', () => {
      const registry = registryWith([widgetDefinition()]);

      expect(registry.finalStatusOf('widget')).toBe(3);
    });
  });
});
