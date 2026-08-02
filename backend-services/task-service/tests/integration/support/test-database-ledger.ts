import { DataSource, EntityManager } from 'typeorm';

/**
 * Every table a database-backed suite in this service can write to, listed
 * children before parents — the one order a delete can walk without a foreign
 * key ever blocking it (`task_status_history` references both `tasks` and
 * `users`; `tasks` references `users`). Putting a row back walks the same list
 * backwards.
 */
const LEDGERED_TABLES = ['task_status_history', 'tasks', 'users'] as const;

type LedgeredTable = (typeof LEDGERED_TABLES)[number];

/**
 * `task_status_history` is range-partitioned on `created_at` and Postgres
 * requires the partition key inside the primary key, so a row there is
 * addressed by `(id, created_at)` where the other two tables need `id` alone.
 */
const PRIMARY_KEY_COLUMNS: Record<LedgeredTable, readonly string[]> = {
  task_status_history: ['id', 'created_at'],
  tasks: ['id'],
  users: ['id'],
};

/**
 * What separates a write the ledger owns from one it must never touch. Every
 * connection a test writes over — the builders, raw SQL, the DAOs' query
 * builders and, in the API suites, the running Nest app — comes out of the one
 * pool the test-database helper opens, and that pool announces itself to
 * Postgres under this name. A developer's browser session against the same
 * database arrives over the backend container's own pool, and a `psql` window
 * over its own connection; neither carries this name, so the trigger below
 * records neither, and the restore can never reach a row a person created or
 * edited while the suite was running.
 *
 * Reserved-prefixed like the test records themselves — nothing outside this
 * suite is entitled to claim it.
 */
export const LEDGER_CONNECTION_MARKER = 'zztest_ledger';

const AUDIT_TABLE = 'zztest_ledger_audit';
const AUDIT_FUNCTION = 'zztest_ledger_record';
const AUDIT_TRIGGER = 'zztest_ledger_audit_trigger';

/** What Postgres reports in `TG_OP`; `INSERT` is the one that means the row is the test's own. */
type AuditedOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * One write, as the trigger recorded it at the moment it happened. `rowImage`
 * carries the row as it stood *before* an update or a delete — the pre-image
 * the restore writes back — and is absent for an insert, which has nothing to
 * preserve.
 */
interface AuditEntry {
  readonly table: LedgeredTable;
  readonly operation: AuditedOperation;
  readonly rowId: string;
  readonly rowCreatedAt: string;
  readonly rowImage: string | null;
}

/**
 * Creates the audit trail and the triggers that fill it, after dropping any
 * left behind by a run that died before its teardown. Row triggers declared on
 * the partitioned parent are cloned onto every partition, so a history row
 * lands in the trail whichever month it routes into.
 *
 * The trigger stays out of the way of everything it is not entitled to: it
 * returns without recording unless the writing session announced itself as
 * {@link LEDGER_CONNECTION_MARKER}.
 */
export async function installLedgerAudit(dataSource: DataSource): Promise<void> {
  await uninstallLedgerAudit(dataSource);

  await dataSource.query(`
    CREATE TABLE ${AUDIT_TABLE} (
      entry_number bigserial PRIMARY KEY,
      table_name text NOT NULL,
      operation text NOT NULL,
      row_id uuid NOT NULL,
      row_created_at timestamptz NOT NULL,
      row_image json
    )
  `);

  await dataSource.query(`
    CREATE FUNCTION ${AUDIT_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('application_name', true) IS DISTINCT FROM '${LEDGER_CONNECTION_MARKER}' THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO ${AUDIT_TABLE} (table_name, operation, row_id, row_created_at, row_image)
        VALUES (TG_ARGV[0], TG_OP, NEW.id, NEW.created_at, NULL);
      ELSE
        INSERT INTO ${AUDIT_TABLE} (table_name, operation, row_id, row_created_at, row_image)
        VALUES (TG_ARGV[0], TG_OP, OLD.id, OLD.created_at, row_to_json(OLD));
      END IF;

      RETURN NULL;
    END;
    $$
  `);

  for (const table of LEDGERED_TABLES) {
    // The logical table travels as a trigger argument rather than being read
    // from `TG_TABLE_NAME`, which on a partitioned write names the partition
    // the row routed into, not the parent the restore addresses it by.
    await dataSource.query(`
      CREATE TRIGGER ${AUDIT_TRIGGER}
      AFTER INSERT OR UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION ${AUDIT_FUNCTION}('${table}')
    `);
  }
}

/**
 * Removes every object {@link installLedgerAudit} created. Written to succeed
 * against a database that has none of them, so it doubles as the repair for a
 * run that crashed — no developer is left with a stray audit table and three
 * triggers on their own schema.
 */
export async function uninstallLedgerAudit(dataSource: DataSource): Promise<void> {
  for (const table of LEDGERED_TABLES) {
    await dataSource.query(`DROP TRIGGER IF EXISTS ${AUDIT_TRIGGER} ON ${table}`);
  }

  await dataSource.query(`DROP FUNCTION IF EXISTS ${AUDIT_FUNCTION}()`);
  await dataSource.query(`DROP TABLE IF EXISTS ${AUDIT_TABLE}`);
}

/**
 * Reinstates the trail if anything removed it. Two `TestDatabase` handles can
 * point at one database — this helper's own teardown coverage opens a second
 * one and tears it down mid-suite — and the trail they share is schema, not
 * per-handle state, so the surviving handle repairs it rather than silently
 * recording nothing from there on.
 */
export async function ensureLedgerAuditInstalled(dataSource: DataSource): Promise<void> {
  if (await isLedgerAuditInstalled(dataSource)) {
    return;
  }

  await installLedgerAudit(dataSource);
}

/** True only while the audit trail and a trigger on every ledgered table are all in place. */
export async function isLedgerAuditInstalled(dataSource: DataSource): Promise<boolean> {
  const [state]: Array<{ audit_table_present: boolean; trigger_count: number }> =
    await dataSource.query(
      `SELECT to_regclass($1) IS NOT NULL AS audit_table_present,
              (SELECT count(*)::int FROM pg_trigger WHERE tgname = $2 AND NOT tgisinternal) AS trigger_count`,
      [AUDIT_TABLE, AUDIT_TRIGGER],
    );

  return (
    Boolean(state?.audit_table_present) && (state?.trigger_count ?? 0) >= LEDGERED_TABLES.length
  );
}

/** Empties the trail, so what it holds next is one test's writes and nothing else. */
export async function clearLedgerAudit(dataSource: DataSource): Promise<void> {
  await dataSource.query(`TRUNCATE ${AUDIT_TABLE}`);
}

/**
 * Undoes every write the trail holds, in one transaction: rows the test added
 * are deleted children before parents, rows that were already there are put
 * back exactly as they stood before the test first touched them, parents
 * before children. Nothing outside the trail is ever named by these
 * statements, which is what keeps a concurrent write from another connection
 * out of their reach.
 */
export async function restoreLedger(dataSource: DataSource): Promise<void> {
  const entries = await readEarliestEntryPerRow(dataSource);

  if (entries.length === 0) {
    return;
  }

  const added = entries.filter((entry) => entry.operation === 'INSERT');
  const preExisting = entries.filter((entry) => entry.operation !== 'INSERT');

  await dataSource.transaction(async (manager) => {
    for (const entry of orderedByTable(added, LEDGERED_TABLES)) {
      await deleteAuditedRow(manager, entry);
    }

    for (const entry of orderedByTable(preExisting, parentsFirstTables())) {
      await putAuditedRowBack(manager, entry);
    }
  });
}

/**
 * One entry per row, the earliest the trail holds for it — a test that updated
 * the same row twice, or updated and then deleted it, is undone to the state it
 * found rather than to an intermediate one. That first entry's operation is
 * also what says whether the row is the test's own (`INSERT`) or something that
 * was already there.
 */
async function readEarliestEntryPerRow(dataSource: DataSource): Promise<AuditEntry[]> {
  const rows: Array<{
    table_name: LedgeredTable;
    operation: AuditedOperation;
    row_id: string;
    row_created_at: string;
    row_image: string | null;
  }> = await dataSource.query(
    `SELECT table_name, operation, row_id::text AS row_id,
            row_created_at::text AS row_created_at, row_image::text AS row_image
     FROM ${AUDIT_TABLE} ORDER BY entry_number`,
  );

  const earliestPerRow = new Map<string, AuditEntry>();

  for (const row of rows) {
    const rowKey = `${row.table_name}:${row.row_id}`;

    if (!earliestPerRow.has(rowKey)) {
      earliestPerRow.set(rowKey, {
        table: row.table_name,
        operation: row.operation,
        rowId: row.row_id,
        rowCreatedAt: row.row_created_at,
        rowImage: row.row_image,
      });
    }
  }

  return [...earliestPerRow.values()];
}

function parentsFirstTables(): readonly LedgeredTable[] {
  return [...LEDGERED_TABLES].reverse();
}

function orderedByTable(
  entries: readonly AuditEntry[],
  tables: readonly LedgeredTable[],
): AuditEntry[] {
  return tables.flatMap((table) => entries.filter((entry) => entry.table === table));
}

async function deleteAuditedRow(manager: EntityManager, entry: AuditEntry): Promise<void> {
  const primaryKey = primaryKeyOf(entry);

  await manager.query(
    `DELETE FROM ${entry.table} WHERE ${primaryKey.predicate}`,
    primaryKey.values,
  );
}

/**
 * Restores one row to its pre-image whether the test updated it or deleted it
 * outright: the insert re-creates a row that is gone (routing itself into the
 * right partition), and the conflict branch rewrites one that is still there.
 * `json_populate_record` maps the stored image onto the table's own row type,
 * so every column comes back with the type the migration declared it with —
 * microseconds on a `timestamptz`, an object on a `jsonb` — rather than the
 * text the image is carried as.
 */
async function putAuditedRowBack(manager: EntityManager, entry: AuditEntry): Promise<void> {
  const preImage = entry.rowImage;

  if (preImage === null) {
    throw new Error(`A recorded ${entry.operation} on ${entry.table} carried no pre-image`);
  }

  const conflictTarget = PRIMARY_KEY_COLUMNS[entry.table].join(', ');
  const rewrittenColumns = rewritableColumnsOf(entry.table, preImage)
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  await manager.query(
    `INSERT INTO ${entry.table} SELECT * FROM json_populate_record(NULL::${entry.table}, $1::json)
     ON CONFLICT (${conflictTarget}) DO UPDATE SET ${rewrittenColumns}`,
    [preImage],
  );
}

/**
 * Every column except the ones the row is addressed by, taken from the stored
 * image rather than a list repeated here — a column a later migration adds is
 * restored without this file knowing the schema at all.
 */
function rewritableColumnsOf(table: LedgeredTable, image: string): string[] {
  const primaryKeyColumns: readonly string[] = PRIMARY_KEY_COLUMNS[table];

  return Object.keys(JSON.parse(image) as Record<string, unknown>).filter(
    (column) => !primaryKeyColumns.includes(column),
  );
}

function primaryKeyOf(entry: AuditEntry): { predicate: string; values: unknown[] } {
  const addressableValues: Record<string, unknown> = {
    id: entry.rowId,
    created_at: entry.rowCreatedAt,
  };
  const columns = PRIMARY_KEY_COLUMNS[entry.table];

  return {
    predicate: columns.map((column, index) => `${column} = $${index + 1}`).join(' AND '),
    values: columns.map((column) => addressableValues[column]),
  };
}
