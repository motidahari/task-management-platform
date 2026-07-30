import { DevelopmentDefinition } from './development.definition';
import { ProcurementDefinition } from './procurement.definition';

/**
 * The single registration point for task-type definitions — one entry per
 * type, nothing else. `task-type.module.ts` spreads this array into both its
 * `providers` list and the `ALL_TASK_TYPE_DEFINITIONS` factory's `inject`
 * list, so a class registered as a provider is always injected into the
 * aggregate (and the reverse): there is no second, hand-maintained list to
 * fall out of sync, which is what made a half-registered definition
 * (provided but never injected, or vice versa) representable before.
 */
export const TASK_TYPE_DEFINITION_CLASSES = [ProcurementDefinition, DevelopmentDefinition] as const;
