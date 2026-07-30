import { getMetadataArgsStorage } from 'typeorm';

type MetadataArgsStorage = ReturnType<typeof getMetadataArgsStorage>;
type TableMetadataArgs = MetadataArgsStorage['tables'][number];
type ColumnMetadataArgs = MetadataArgsStorage['columns'][number];
type EntityClass = new (...args: unknown[]) => unknown;

/**
 * Reads TypeORM's decorator metadata directly — no DataSource, no DB
 * connection — so entity contract tests stay unit-level and instant.
 */
export function tableMetadataFor(entity: EntityClass): TableMetadataArgs {
  const table = getMetadataArgsStorage().tables.find((candidate) => candidate.target === entity);

  if (!table) {
    throw new Error(`No @Entity table metadata found for ${entity.name}`);
  }

  return table;
}

export function columnMetadataFor(entity: EntityClass, propertyName: string): ColumnMetadataArgs {
  const column = getMetadataArgsStorage().columns.find(
    (candidate) => candidate.target === entity && candidate.propertyName === propertyName,
  );

  if (!column) {
    throw new Error(`No column metadata found for ${entity.name}.${propertyName}`);
  }

  return column;
}

/** `default` is stored as a literal or a `() => sql` factory — resolve either to its value. */
export function resolvedDefault(column: ColumnMetadataArgs): unknown {
  const value: unknown = column.options.default;

  return typeof value === 'function' ? (value as () => unknown)() : value;
}

/**
 * The actual database column name: an explicit `name` override, or the
 * property name verbatim when there is none — this service configures no
 * naming strategy, so a camelCase property with no override becomes a
 * camelCase column, not the snake_case name the schema expects.
 */
export function databaseColumnName(column: ColumnMetadataArgs): string {
  return column.options.name ?? column.propertyName;
}
