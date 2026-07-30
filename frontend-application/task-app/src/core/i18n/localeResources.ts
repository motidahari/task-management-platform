/**
 * Pure derivation/aggregation logic behind the i18n resource tree — kept
 * free of Vite's `import.meta.glob` so it can be exercised directly with
 * fabricated paths, both for the happy path and for scope collisions.
 */

/** Folder names that only describe project structure, never a translation scope. */
const STRUCTURAL_SEGMENTS = new Set(['features', 'components']);

export type LocaleDictionary = Record<string, unknown>;

/**
 * Derives the dotted, kebab-case scope for a co-located dictionary from its
 * path, e.g. `/src/features/tasks/components/TaskCard/locales/en.json` →
 * `tasks.task-card`.
 */
export function scopeFromPath(path: string): string {
  const scopeSegments = pathSegmentsBetweenSrcAndLocales(path).filter(
    (segment) => !STRUCTURAL_SEGMENTS.has(segment),
  );

  if (scopeSegments.length === 0) {
    throw new Error(
      `Cannot derive a translation scope from "${path}" — no folder name remains after removing structural segments.`,
    );
  }

  return scopeSegments.map(toKebabCase).join('.');
}

/**
 * Merges every discovered dictionary into one resource tree, nested under
 * its derived scope. Throws when two different paths derive the same scope,
 * since the second dictionary would silently overwrite the first.
 */
export function buildLocaleResources(
  dictionariesByPath: Record<string, LocaleDictionary>,
): LocaleDictionary {
  const resources: LocaleDictionary = {};
  const pathByScope = new Map<string, string>();

  for (const [path, dictionary] of Object.entries(dictionariesByPath)) {
    const scope = scopeFromPath(path);
    const claimedByPath = pathByScope.get(scope);

    if (claimedByPath !== undefined) {
      throw new Error(
        `Translation scope "${scope}" is claimed by both "${claimedByPath}" and "${path}" — rename one folder so scopes stay unique.`,
      );
    }

    pathByScope.set(scope, path);
    setNestedDictionary(resources, scope.split('.'), dictionary);
  }

  return resources;
}

function pathSegmentsBetweenSrcAndLocales(path: string): string[] {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  const srcIndex = segments.indexOf('src');
  const localesIndex = segments.lastIndexOf('locales');
  const isCoLocatedDictionary =
    srcIndex !== -1 &&
    localesIndex !== -1 &&
    localesIndex > srcIndex + 1 &&
    segments[localesIndex + 1] === 'en.json';

  if (!isCoLocatedDictionary) {
    throw new Error(`"${path}" is not a co-located "locales/en.json" file under "src/".`);
  }

  return segments.slice(srcIndex + 1, localesIndex);
}

function toKebabCase(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function setNestedDictionary(
  target: LocaleDictionary,
  scopeSegments: readonly string[],
  dictionary: LocaleDictionary,
): void {
  const [segment, ...remainingSegments] = scopeSegments;

  if (segment === undefined) {
    return;
  }

  if (remainingSegments.length === 0) {
    target[segment] = dictionary;
    return;
  }

  target[segment] ??= {};
  setNestedDictionary(target[segment] as LocaleDictionary, remainingSegments, dictionary);
}
