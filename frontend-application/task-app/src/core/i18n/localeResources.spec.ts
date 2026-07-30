import { describe, expect, it } from 'vitest';

import { buildLocaleResources, scopeFromPath } from './localeResources';

describe('scopeFromPath, Given:a co-located dictionary nested under a feature component', () => {
  it('should derive a dotted, kebab-case scope, dropping structural folders', () => {
    const scope = scopeFromPath('/src/features/tasks/components/TaskCard/locales/en.json');

    expect(scope).toBe('tasks.task-card');
  });
});

describe('scopeFromPath, Given:a dictionary with no folder above "locales"', () => {
  it('should keep that single folder name as the scope', () => {
    const scope = scopeFromPath('/src/shared/locales/en.json');

    expect(scope).toBe('shared');
  });
});

describe('scopeFromPath, Given:a path that is not a co-located "locales/en.json" file', () => {
  it('should throw', () => {
    expect(() => scopeFromPath('/src/features/tasks/en.json')).toThrow();
  });
});

describe('buildLocaleResources, Given:dictionaries discovered across the app', () => {
  it('should nest each dictionary under its derived scope', () => {
    const resources = buildLocaleResources({
      '/src/features/tasks/components/TaskCard/locales/en.json': {
        'assignee-label': 'Assigned to',
      },
      '/src/shared/locales/en.json': {
        errors: { 'load-failed': 'Could not load' },
      },
    });

    expect(resources).toEqual({
      tasks: { 'task-card': { 'assignee-label': 'Assigned to' } },
      shared: { errors: { 'load-failed': 'Could not load' } },
    });
  });

  it('should throw when two different folders collide on the same derived scope', () => {
    const dictionariesByPath = {
      '/src/features/tasks/components/TaskCard/locales/en.json': {
        'assignee-label': 'Assigned to',
      },
      '/src/features/tasks/components/task-card/locales/en.json': {
        'assignee-label': 'Owner',
      },
    };

    expect(() => buildLocaleResources(dictionariesByPath)).toThrow(/tasks\.task-card/);
  });
});

describe('buildLocaleResources, Given:every locale file currently discovered in the app', () => {
  it('should build the resource tree without a scope collision', () => {
    const localeModules = import.meta.glob<{ default: Record<string, unknown> }>(
      '/src/**/locales/en.json',
      { eager: true },
    );
    const dictionariesByPath = Object.fromEntries(
      Object.entries(localeModules).map(([path, dictionaryModule]) => [
        path,
        dictionaryModule.default,
      ]),
    );

    expect(() => buildLocaleResources(dictionariesByPath)).not.toThrow();
  });
});
