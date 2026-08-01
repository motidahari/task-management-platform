import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import {
  ALL_TASK_TYPE_DEFINITIONS,
  type StatusDefinition,
  type TaskTypeDefinition,
} from './interfaces/task-type-definition.interface';

interface DistinctTaskTypeRow {
  readonly type: string;
}

/**
 * Raised when the registered definitions would be internally inconsistent,
 * or when a persisted task references a type no definition declares.
 * Thrown from `onModuleInit`, so a misconfigured deploy crashes at startup —
 * an operator-facing failure once — instead of surfacing per request once
 * real traffic hits the affected type.
 */
export class TaskTypeRegistryValidationError extends Error {
  constructor(violations: readonly string[]) {
    super(`Task type registry is invalid:\n- ${violations.join('\n- ')}`);
    this.name = TaskTypeRegistryValidationError.name;
  }
}

/**
 * In-memory lookup of every registered task-type definition, keyed by
 * `type`. Built once from the injected definition list; every read after
 * that is a plain `Map` access, so looking up a type never costs I/O.
 *
 * The one-time exception is `onModuleInit`, which runs before the app
 * accepts traffic: it checks the definitions are internally consistent, then
 * that every type already persisted in the database is still registered —
 * catching a deploy that renamed or dropped a type while rows of it still
 * exist, rather than letting that surface as a per-request failure later.
 */
@Injectable()
export class TaskTypeRegistry implements OnModuleInit {
  private readonly definitionsByType = new Map<string, TaskTypeDefinition>();

  constructor(
    @Inject(ALL_TASK_TYPE_DEFINITIONS) private readonly definitions: TaskTypeDefinition[],
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    for (const definition of definitions) {
      this.definitionsByType.set(definition.type, definition);
    }
  }

  async onModuleInit(): Promise<void> {
    assertRegistryIsSelfConsistent(this.definitions);
    await this.assertEveryPersistedTypeIsRegistered();
  }

  findByType(type: string): TaskTypeDefinition | null {
    return this.definitionsByType.get(type) ?? null;
  }

  getAll(): TaskTypeDefinition[] {
    return [...this.definitionsByType.values()];
  }

  /**
   * Derived from the last entry of `statuses` rather than stored on the
   * definition — a field that only ever restates the last array entry would
   * be a second source of truth that can merely agree or silently drift.
   */
  finalStatusOf(type: string): number {
    const definition = this.definitionsByType.get(type);

    if (!definition) {
      throw new Error(`Cannot derive a final status for unregistered task type "${type}".`);
    }

    return lastStatusOf(definition).status;
  }

  /**
   * Resolves a persisted `status` integer to its definition's display-agnostic
   * `name`, the one piece of status metadata the wire response carries beyond
   * the raw number. A persisted task's `type`/`status` pair is always
   * registered by construction (`onModuleInit` refuses to boot otherwise), so
   * a lookup miss here is an internal inconsistency, not a client-facing error
   * — the same reasoning `TaskService.statusDefinitionOf` already applies.
   */
  statusNameOf(type: string, status: number): string {
    const statusDefinition = this.definitionsByType
      .get(type)
      ?.statuses.find((candidate) => candidate.status === status);

    if (!statusDefinition) {
      throw new Error(`Task type "${type}" has no status definition for status ${status}.`);
    }

    return statusDefinition.name;
  }

  private async assertEveryPersistedTypeIsRegistered(): Promise<void> {
    const rows = await this.dataSource.query<DistinctTaskTypeRow[]>(
      'SELECT DISTINCT type FROM tasks',
    );
    const orphanedTypes = rows
      .map((row) => row.type)
      .filter((type) => !this.definitionsByType.has(type));

    if (orphanedTypes.length > 0) {
      throw new TaskTypeRegistryValidationError([
        `Task rows exist for type(s) no longer registered: ${orphanedTypes.join(', ')}. ` +
          'Renaming or removing a type requires migrating its rows first.',
      ]);
    }
  }
}

function lastStatusOf(definition: TaskTypeDefinition): StatusDefinition {
  const lastStatus = definition.statuses[definition.statuses.length - 1];

  if (!lastStatus) {
    throw new Error(`Task type "${definition.type}" does not declare any statuses.`);
  }

  return lastStatus;
}

function assertRegistryIsSelfConsistent(definitions: readonly TaskTypeDefinition[]): void {
  const violations = [
    ...duplicateTypeKeyViolations(definitions),
    ...definitions.flatMap((definition) => [
      ...emptyDisplayStringViolations(definition),
      ...statusSequenceViolations(definition),
      ...creationStatusFieldViolations(definition),
      ...duplicateFieldKeyViolations(definition),
    ]),
  ];

  if (violations.length > 0) {
    throw new TaskTypeRegistryValidationError(violations);
  }
}

function duplicateTypeKeyViolations(definitions: readonly TaskTypeDefinition[]): string[] {
  const seenTypes = new Set<string>();
  const duplicateTypes = new Set<string>();

  for (const { type } of definitions) {
    if (seenTypes.has(type)) {
      duplicateTypes.add(type);
    }

    seenTypes.add(type);
  }

  return [...duplicateTypes].map((type) => `Task type "${type}" is registered more than once.`);
}

/**
 * Every status number must appear exactly once, ascending from 1 — the
 * engine derives "forward" as `status + 1` and the final status as the last
 * entry, so a gap or an out-of-order run would make either derivation wrong
 * for no visible reason until a task reaches the missing status.
 */
function statusSequenceViolations(definition: TaskTypeDefinition): string[] {
  if (definition.statuses.length === 0) {
    return [`Task type "${definition.type}" does not declare any statuses.`];
  }

  const orderedStatusNumbers = [...definition.statuses]
    .map((status) => status.status)
    .sort((left, right) => left - right);
  const isContiguousFromOne = orderedStatusNumbers.every(
    (statusNumber, index) => statusNumber === index + 1,
  );

  if (isContiguousFromOne) {
    return [];
  }

  return [
    `Task type "${definition.type}" statuses must be contiguous ascending from 1 (found: ${orderedStatusNumbers.join(', ')}).`,
  ];
}

/**
 * Status 1 is where a task is created, before any transition has run — it
 * can never carry required fields because nothing has validated them yet.
 */
function creationStatusFieldViolations(definition: TaskTypeDefinition): string[] {
  const creationStatus = definition.statuses.find((status) => status.status === 1);

  if (!creationStatus || creationStatus.requiredFields.length === 0) {
    return [];
  }

  return [
    `Task type "${definition.type}" status 1 must not declare required fields — creation carries no custom data.`,
  ];
}

/**
 * A field key reused across two statuses of the same type would let one
 * transition's validation "cover" a key another transition also writes,
 * making it ambiguous which status actually owns that piece of JSONB.
 */
function duplicateFieldKeyViolations(definition: TaskTypeDefinition): string[] {
  const occurrencesByKey = new Map<string, number>();

  for (const status of definition.statuses) {
    for (const field of status.requiredFields) {
      occurrencesByKey.set(field.key, (occurrencesByKey.get(field.key) ?? 0) + 1);
    }
  }

  return [...occurrencesByKey.entries()]
    .filter(([, occurrences]) => occurrences > 1)
    .map(
      ([key]) =>
        `Task type "${definition.type}" declares field key "${key}" in more than one status.`,
    );
}

function emptyDisplayStringViolations(definition: TaskTypeDefinition): string[] {
  const violations: string[] = [];

  if (isBlank(definition.displayName)) {
    violations.push(`Task type "${definition.type}" has an empty displayName.`);
  }

  for (const status of definition.statuses) {
    if (isBlank(status.displayName)) {
      violations.push(
        `Task type "${definition.type}" status ${status.status} has an empty displayName.`,
      );
    }

    for (const field of status.requiredFields) {
      if (isBlank(field.label)) {
        violations.push(`Task type "${definition.type}" field "${field.key}" has an empty label.`);
      }
    }
  }

  return violations;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
