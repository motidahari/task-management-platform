import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { TASK_TYPE_DEFINITION_CLASSES } from '../../../src/task-type/definitions';
import { DevelopmentDefinition } from '../../../src/task-type/definitions/development.definition';
import { ProcurementDefinition } from '../../../src/task-type/definitions/procurement.definition';
import {
  ALL_TASK_TYPE_DEFINITIONS,
  type TaskTypeDefinition,
} from '../../../src/task-type/interfaces/task-type-definition.interface';
import { TaskTypeModule } from '../../../src/task-type/task-type.module';

/**
 * Stands in for the real `DatabaseModule`. `TaskTypeModule` never imports it
 * directly — the real app resolves `DataSource` through its global
 * `TypeOrmCoreModule` registration, so this fake is marked `@Global()` too,
 * the same way `HealthService` resolves it without `HealthModule` importing
 * the database module.
 */
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: { query: jest.fn() } }],
  exports: [getDataSourceToken()],
})
class FakeDatabaseModule {}

/**
 * `TaskTypeRegistry` (also provided by `TaskTypeModule`) injects the app's
 * `DataSource` — stubbing it here keeps these tests focused on the
 * registration array rather than on database wiring.
 */
function compileTaskTypeModule(): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [FakeDatabaseModule, TaskTypeModule] }).compile();
}

describe('TASK_TYPE_DEFINITION_CLASSES', () => {
  describe('Given:the registration array, When:reading its members', () => {
    it('should contain exactly the procurement and development definition classes', () => {
      expect(TASK_TYPE_DEFINITION_CLASSES).toHaveLength(2);
      expect(TASK_TYPE_DEFINITION_CLASSES).toEqual([ProcurementDefinition, DevelopmentDefinition]);
    });
  });

  describe('Given:the registration array, When:resolved through TaskTypeModule', () => {
    it('should register every class in the array as its own provider', async () => {
      const moduleRef = await compileTaskTypeModule();

      const instances = TASK_TYPE_DEFINITION_CLASSES.map((definitionClass) =>
        moduleRef.get(definitionClass),
      );

      expect(instances).toEqual([
        expect.any(ProcurementDefinition),
        expect.any(DevelopmentDefinition),
      ]);
    });

    it('should inject exactly those provider instances into ALL_TASK_TYPE_DEFINITIONS, in array order', async () => {
      const moduleRef = await compileTaskTypeModule();

      const providerInstances = TASK_TYPE_DEFINITION_CLASSES.map((definitionClass) =>
        moduleRef.get(definitionClass),
      );
      const aggregated = moduleRef.get<TaskTypeDefinition[]>(ALL_TASK_TYPE_DEFINITIONS);

      expect(aggregated).toHaveLength(TASK_TYPE_DEFINITION_CLASSES.length);
      expect(aggregated).toEqual(providerInstances);
    });

    it('should keep the array as the single source: every entry is both a provider and an injected instance', async () => {
      const moduleRef = await compileTaskTypeModule();

      const aggregated = moduleRef.get<TaskTypeDefinition[]>(ALL_TASK_TYPE_DEFINITIONS);

      // Same length by construction (inject: [...TASK_TYPE_DEFINITION_CLASSES]) —
      // removing or adding a class only requires editing this one array; there
      // is no second list that could be forgotten and leave a gap.
      expect(aggregated).toHaveLength(TASK_TYPE_DEFINITION_CLASSES.length);
      TASK_TYPE_DEFINITION_CLASSES.forEach((definitionClass, index) => {
        expect(aggregated[index]).toBeInstanceOf(definitionClass);
      });
    });
  });
});
