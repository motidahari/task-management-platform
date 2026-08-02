import { randomUUID } from 'node:crypto';

import { DataSource, EntityManager } from 'typeorm';

/**
 * Every table a database-backed suite in this service can write to, listed
 * parents before children: `tasks` references `users`, and
 * `task_status_history` references both. Putting rows back walks the list this
 * way round; deleting rows the test added walks it backwards.
 */
const LEDGERED_TABLES = ['users', 'tasks', 'task_status_history'] as const;

type LedgeredTable = (typeof LEDGERED_TABLES)[number];

/**
 * `task_status_history` is range-partitioned on `created_at` and Postgres
 * requires the partition key inside the primary key, so a row there is
 * addressed by `(id, created_at)` where the other two tables need `id` alone.
 */
const PRIMARY_KEY_COLUMNS: Record<LedgeredTable, readonly string[]> = {
  users: ['id'],
  tasks: ['id'],
  task_status_history: ['id', 'created_at'],
};

interface ChildReference {
  readonly table: LedgeredTable;
  readonly column: string;
}

/**
 * Every foreign key pointing *into* each table. Deleting a row the test added
 * has to account for these: `task_status_history.task_id` cascades, so a plain
 * delete of a task would silently take rows with it that nobody recorded — a
 * history row a person wrote from the UI against that very task, for instance.
 */
const CHILD_REFERENCES: Record<LedgeredTable, readonly ChildReference[]> = {
  users: [
    { table: 'tasks', column: 'assigned_user_id' },
    { table: 'task_status_history', column: 'assigned_user_id' },
  ],
  tasks: [{ table: 'task_status_history', column: 'task_id' }],
  task_status_history: [],
};

/**
 * Shared by every run, so one trigger definition serves them all; what follows
 * it is what tells two runs apart.
 */
const LEDGER_MARKER_PREFIX = 'zztest_ledger';

/**
 * What tells this run apart from every other one against the same database. The
 * documented workflow here is parallel worktrees, so two runs at once is the
 * normal case, not the exotic one — and without this they would be one
 * indistinguishable writer, each cheerfully undoing the other's rows mid-test.
 * A developer editing data from the UI is a third writer, and is marked as
 * nothing at all.
 */
export const TEST_RUN_ID = `${process.pid}_${randomUUID().slice(0, 8)}`;

/**
 * This run's marker: every connection the test-database helper opens announces
 * itself to Postgres under this name, the trigger stamps it onto each row it
 * records, and a restore only ever looks at rows carrying it.
 *
 * Postgres truncates `application_name` at 63 bytes; this is far shorter.
 */
export const LEDGER_CONNECTION_MARKER = `${LEDGER_MARKER_PREFIX}_${TEST_RUN_ID}`;

const AUDIT_TABLE = 'zztest_ledger_audit';
const RUNS_TABLE = 'zztest_ledger_runs';
const AUDIT_FUNCTION = 'zztest_ledger_record';
const AUDIT_TRIGGER = 'zztest_ledger_audit_trigger';

/**
 * Serializes the create/drop of the shared trail between concurrent runs, so
 * one run can never observe another halfway through installing it. Deliberately
 * not the key the partition-maintenance job uses — two unrelated advisory locks
 * sharing a key would deadlock work that has nothing to do with each other.
 */
const LEDGER_SCHEMA_LOCK_KEY = 84_627_100_2;

/** The three writes the trail records; `OPEN` marks a ledger the helper opened and is not a write. */
const AUDITED_OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'] as const;

type AuditedOperation = (typeof AUDITED_OPERATIONS)[number];

const LEDGER_OPEN_OPERATION = 'OPEN';

/**
 * One write, as the trigger recorded it at the moment it happened. `preImage`
 * is the row before the write (absent for an insert, which had no before) and
 * `postImage` the row after it (absent for a delete). Between them they say not
 * just what to put back but which columns this run is entitled to put back —
 * a column that has moved on since `postImage` belongs to somebody else.
 */
interface AuditEntry {
  readonly table: LedgeredTable;
  readonly operation: AuditedOperation;
  readonly rowId: string;
  readonly rowCreatedAt: string;
  readonly preImage: string | null;
  readonly postImage: string | null;
}

/** A row addressed the way its table's primary key addresses it. */
type RowKey = string;

/**
 * Creates the shared trail if it is not already there and enrols this run in
 * it. Never drops what it finds: another run may be mid-test against the same
 * database, and its trail is the only record of what it still has to undo.
 *
 * Row triggers declared on the partitioned parent are cloned onto every
 * partition, so a history row lands in the trail whichever month it routes
 * into. The trigger records for any marked run and stamps which one, so one
 * definition serves however many are connected.
 */
export async function installLedgerAudit(
  dataSource: DataSource,
  recordPrefix: string,
): Promise<void> {
  await withLedgerSchemaLock(dataSource, async () => {
    await createLedgerObjectsIfAbsent(dataSource);
    await discardCrashedRuns(dataSource);

    await dataSource.query(
      `INSERT INTO ${RUNS_TABLE} (run_id, record_prefix) VALUES ($1, $2) ON CONFLICT (run_id) DO NOTHING`,
      [LEDGER_CONNECTION_MARKER, recordPrefix],
    );
  });
}

/**
 * The record prefix of every run currently enrolled, this one included. A
 * prefix sweep looking for residue is entitled to everything else that carries
 * the reserved prefix, and to none of these — they belong to runs still using
 * them.
 */
export async function enrolledRecordPrefixes(dataSource: DataSource): Promise<string[]> {
  const rows: Array<{ record_prefix: string }> = await dataSource.query(
    `SELECT record_prefix FROM ${RUNS_TABLE}`,
  );

  return rows.map((row) => row.record_prefix);
}

/**
 * Withdraws this run: its rows and its enrolment go, and the shared objects go
 * with them only once no run is left enrolled. A run that crashed before
 * reaching here leaves its enrolment behind, which the next
 * {@link installLedgerAudit} discards on sight — so the objects do outlive a
 * crash, until the run after it starts.
 */
export async function uninstallLedgerAudit(dataSource: DataSource): Promise<void> {
  await withLedgerSchemaLock(dataSource, async () => {
    if (!(await ledgerObjectsExist(dataSource))) {
      return;
    }

    await dataSource.query(`DELETE FROM ${AUDIT_TABLE} WHERE run_id = $1`, [
      LEDGER_CONNECTION_MARKER,
    ]);
    await dataSource.query(`DELETE FROM ${RUNS_TABLE} WHERE run_id = $1`, [
      LEDGER_CONNECTION_MARKER,
    ]);

    const [enrolment]: Array<{ enrolled_runs: number }> = await dataSource.query(
      `SELECT count(*)::int AS enrolled_runs FROM ${RUNS_TABLE}`,
    );

    if ((enrolment?.enrolled_runs ?? 0) === 0) {
      await dropLedgerObjects(dataSource);
    }
  });
}

/** True only while the trail and a trigger on each ledgered table are all in place. */
export async function isLedgerAuditInstalled(dataSource: DataSource): Promise<boolean> {
  const [state]: Array<{ audit_table_present: boolean; ledgered_tables_with_trigger: number }> =
    await dataSource.query(
      `SELECT to_regclass($1) IS NOT NULL AS audit_table_present,
              (SELECT count(DISTINCT ledgered.relname)::int
                 FROM pg_trigger AS audit_trigger
                 JOIN pg_class AS ledgered ON ledgered.oid = audit_trigger.tgrelid
                 JOIN pg_namespace AS ledgered_schema ON ledgered_schema.oid = ledgered.relnamespace
                WHERE audit_trigger.tgname = $2
                  AND NOT audit_trigger.tgisinternal
                  AND ledgered_schema.nspname = 'public'
                  AND ledgered.relname = ANY($3)) AS ledgered_tables_with_trigger`,
      [AUDIT_TABLE, AUDIT_TRIGGER, [...LEDGERED_TABLES]],
    );

  return (
    Boolean(state?.audit_table_present) &&
    state?.ledgered_tables_with_trigger === LEDGERED_TABLES.length
  );
}

/**
 * Opens this run's ledger: its previous entries go, and a single `OPEN` entry
 * takes their place. That entry is the proof the trail survived the test —
 * {@link restoreLedger} refuses to report "nothing to undo" without finding it,
 * because a trail that was dropped or truncated mid-test looks exactly like a
 * test that wrote nothing.
 *
 * Call {@link installLedgerAudit} first: opening is where the trail may need
 * reinstating (another handle on the same database can have taken the shared
 * objects with it), whereas restoring must never reinstate anything — an empty
 * trail conjured up there would turn "the record is gone" into "there was
 * nothing to undo".
 */
export async function openLedger(dataSource: DataSource): Promise<void> {
  await dataSource.query(`DELETE FROM ${AUDIT_TABLE} WHERE run_id = $1`, [
    LEDGER_CONNECTION_MARKER,
  ]);
  await dataSource.query(`INSERT INTO ${AUDIT_TABLE} (run_id, operation) VALUES ($1, $2)`, [
    LEDGER_CONNECTION_MARKER,
    LEDGER_OPEN_OPERATION,
  ]);
}

/**
 * Drops the writes this run recorded, leaving every other run's alone and
 * leaving the `OPEN` entry in place — the ledger stays open, so restoring twice
 * is a restore and then a no-op rather than a restore and then a complaint that
 * no ledger was ever opened.
 */
export async function clearRecordedWrites(dataSource: DataSource): Promise<void> {
  await dataSource.query(`DELETE FROM ${AUDIT_TABLE} WHERE run_id = $1 AND operation <> $2`, [
    LEDGER_CONNECTION_MARKER,
    LEDGER_OPEN_OPERATION,
  ]);
}

/**
 * Undoes the writes this run recorded, and only those. Rows that were already
 * there are put back first, parents before children, so a row the test pointed
 * at something it also inserted stops pointing at it before that something is
 * deleted; rows the test added are deleted after, children before parents.
 *
 * A row is not restored wholesale. Only the columns the test actually changed
 * are considered, and only while they still hold what the test left there — a
 * column somebody else has moved on since is left exactly as it is and reported
 * rather than overwritten.
 *
 * Every row is undone independently, so one that cannot be is reported without
 * abandoning the rest. Anything that could not be undone is raised together at
 * the end.
 */
export async function restoreLedger(dataSource: DataSource): Promise<void> {
  await assertLedgerIntact(dataSource);

  const entries = await readEarliestEntryPerRow(dataSource);
  const addedRowKeys = new Set(
    entries.filter((entry) => entry.operation === 'INSERT').map(rowKeyOf),
  );
  const problems: string[] = [];

  for (const entry of orderedByTable(entries, LEDGERED_TABLES)) {
    if (entry.operation !== 'INSERT') {
      problems.push(...(await attempt(() => putRowBack(dataSource, entry))));
    }
  }

  for (const entry of orderedByTable(entries, childrenFirstTables())) {
    if (entry.operation === 'INSERT') {
      problems.push(...(await attempt(() => removeAddedRow(dataSource, entry, addedRowKeys))));
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `The ledger could not undo every write it recorded:\n- ${problems.join('\n- ')}`,
    );
  }
}

/**
 * The `OPEN` entry {@link openLedger} wrote must still be there. Its absence
 * means either that no ledger was opened for this test or that the trail was
 * truncated or dropped while the test ran — and in both cases whatever the test
 * wrote went unrecorded and cannot be undone. That is the one outcome that must
 * never pass for a clean one, since an empty trail otherwise reads exactly like
 * a test that wrote nothing.
 */
async function assertLedgerIntact(dataSource: DataSource): Promise<void> {
  const openEntries = await countOpenEntries(dataSource);

  if (openEntries === 0) {
    throw new Error(
      'No open ledger to restore from — either none was opened for this test, or its audit trail was dropped or truncated while the test ran, so nothing the test wrote can be undone',
    );
  }
}

/** Zero both when the entry was truncated away and when the trail itself no longer exists to hold it. */
async function countOpenEntries(dataSource: DataSource): Promise<number> {
  try {
    const rows: Array<{ open_entries: number }> = await dataSource.query(
      `SELECT count(*)::int AS open_entries FROM ${AUDIT_TABLE} WHERE run_id = $1 AND operation = $2`,
      [LEDGER_CONNECTION_MARKER, LEDGER_OPEN_OPERATION],
    );

    return rows[0]?.open_entries ?? 0;
  } catch {
    return 0;
  }
}

async function attempt(step: () => Promise<string[]>): Promise<string[]> {
  try {
    return await step();
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

/**
 * Puts one row that was already there back the way the test found it: the
 * columns the test changed, and only while nobody has changed them since.
 */
async function putRowBack(dataSource: DataSource, entry: AuditEntry): Promise<string[]> {
  const preImage = entry.preImage;

  if (preImage === null) {
    return [`${describe(entry)}: recorded as ${entry.operation} but carries no pre-image`];
  }

  return dataSource.transaction(async (manager) => {
    const currentImage = await readCurrentRowImage(manager, entry);

    if (entry.postImage === null) {
      return putDeletedRowBack(manager, entry, preImage, currentImage);
    }

    if (currentImage === undefined) {
      return [`${describe(entry)}: another session deleted it after the test updated it`];
    }

    return rewriteUndriftedColumns(manager, entry, preImage, entry.postImage, currentImage);
  });
}

async function putDeletedRowBack(
  manager: EntityManager,
  entry: AuditEntry,
  preImage: string,
  currentImage: string | undefined,
): Promise<string[]> {
  if (currentImage !== undefined) {
    return [`${describe(entry)}: another session re-created it after the test deleted it`];
  }

  await manager.query(
    `INSERT INTO ${entry.table} SELECT * FROM json_populate_record(NULL::${entry.table}, $1::json)`,
    [preImage],
  );

  return [];
}

async function rewriteUndriftedColumns(
  manager: EntityManager,
  entry: AuditEntry,
  preImage: string,
  postImage: string,
  currentImage: string,
): Promise<string[]> {
  const before = parseImage(preImage);
  const after = parseImage(postImage);
  const current = parseImage(currentImage);
  const columnsTheTestChanged = Object.keys(after).filter(
    (column) =>
      !PRIMARY_KEY_COLUMNS[entry.table].includes(column) &&
      !isSameValue(before[column], after[column]),
  );
  const drifted = columnsTheTestChanged.filter(
    (column) => !isSameValue(current[column], after[column]),
  );
  const rewritable = columnsTheTestChanged.filter((column) => !drifted.includes(column));

  if (rewritable.length > 0) {
    const assignments = rewritable.map((column) => `${column} = source.${column}`).join(', ');
    const primaryKey = primaryKeyOf(entry, 2);

    await manager.query(
      `UPDATE ${entry.table} AS target SET ${assignments}
       FROM json_populate_record(NULL::${entry.table}, $1::json) AS source
       WHERE ${primaryKey.predicate}`,
      [preImage, ...primaryKey.values],
    );
  }

  if (drifted.length === 0) {
    return [];
  }

  return [
    `${describe(entry)}: another session changed ${drifted.join(', ')} after the test wrote it, so those columns were left as they are`,
  ];
}

/**
 * Deletes one row the test added, but only once every row that references it is
 * itself one the test added. Otherwise the delete would cascade into somebody
 * else's row — a history entry written from the UI against a task this test
 * created — and take it away unrecorded.
 */
async function removeAddedRow(
  dataSource: DataSource,
  entry: AuditEntry,
  addedRowKeys: ReadonlySet<RowKey>,
): Promise<string[]> {
  const unrecordedChildren = await findUnrecordedChildren(dataSource, entry, addedRowKeys);

  if (unrecordedChildren.length > 0) {
    return [
      `${describe(entry)}: left in place — ${unrecordedChildren.join(', ')} reference it and were written by another session, so deleting it would take them too`,
    ];
  }

  const primaryKey = primaryKeyOf(entry, 1);

  await dataSource.query(
    `DELETE FROM ${entry.table} AS target WHERE ${primaryKey.predicate}`,
    primaryKey.values,
  );

  return [];
}

async function findUnrecordedChildren(
  dataSource: DataSource,
  entry: AuditEntry,
  addedRowKeys: ReadonlySet<RowKey>,
): Promise<string[]> {
  const unrecorded: string[] = [];

  for (const reference of CHILD_REFERENCES[entry.table]) {
    const children: Array<{ id: string; created_at: string }> = await dataSource.query(
      `SELECT id::text AS id, created_at::text AS created_at FROM ${reference.table} WHERE ${reference.column} = $1`,
      [entry.rowId],
    );

    for (const child of children) {
      const childKey = rowKeyFor(reference.table, child.id, child.created_at);

      if (!addedRowKeys.has(childKey)) {
        unrecorded.push(`${reference.table} ${child.id}`);
      }
    }
  }

  return unrecorded;
}

/**
 * One entry per row, the earliest this run recorded for it — a test that
 * updated the same row twice, or updated and then deleted it, is undone to the
 * state it found rather than to an intermediate one. That first entry's
 * operation is also what says whether the row is the test's own (`INSERT`) or
 * something that was already there.
 */
async function readEarliestEntryPerRow(dataSource: DataSource): Promise<AuditEntry[]> {
  const rows: Array<{
    table_name: string;
    operation: string;
    row_id: string;
    row_created_at: string;
    pre_image: string | null;
    post_image: string | null;
  }> = await dataSource.query(
    `SELECT table_name, operation, row_id::text AS row_id, row_created_at::text AS row_created_at,
            pre_image::text AS pre_image, post_image::text AS post_image
     FROM ${AUDIT_TABLE}
     WHERE run_id = $1 AND operation <> $2
     ORDER BY entry_number`,
    [LEDGER_CONNECTION_MARKER, LEDGER_OPEN_OPERATION],
  );

  const earliestPerRow = new Map<RowKey, AuditEntry>();

  for (const row of rows) {
    const entry: AuditEntry = {
      table: asLedgeredTable(row.table_name),
      operation: asAuditedOperation(row.operation),
      rowId: row.row_id,
      rowCreatedAt: row.row_created_at,
      preImage: row.pre_image,
      postImage: row.post_image,
    };
    const rowKey = rowKeyOf(entry);

    if (!earliestPerRow.has(rowKey)) {
      earliestPerRow.set(rowKey, entry);
    }
  }

  return [...earliestPerRow.values()];
}

/**
 * A row is keyed by its whole primary key, not by `id` alone: an update that
 * moves a history row across partitions is a delete and an insert of two
 * different keys, and folding them together would put the old row back while
 * leaving the moved one behind.
 */
function rowKeyOf(entry: AuditEntry): RowKey {
  return rowKeyFor(entry.table, entry.rowId, entry.rowCreatedAt);
}

function rowKeyFor(table: LedgeredTable, rowId: string, createdAt: string): RowKey {
  return PRIMARY_KEY_COLUMNS[table].includes('created_at')
    ? `${table}:${rowId}:${createdAt}`
    : `${table}:${rowId}`;
}

function asLedgeredTable(tableName: string): LedgeredTable {
  const table = LEDGERED_TABLES.find((ledgered) => ledgered === tableName);

  if (!table) {
    throw new Error(`The audit trail names a table the ledger does not own: ${tableName}`);
  }

  return table;
}

function asAuditedOperation(operation: string): AuditedOperation {
  const audited = AUDITED_OPERATIONS.find((known) => known === operation);

  if (!audited) {
    throw new Error(`The audit trail names an operation the ledger cannot undo: ${operation}`);
  }

  return audited;
}

async function readCurrentRowImage(
  manager: EntityManager,
  entry: AuditEntry,
): Promise<string | undefined> {
  const primaryKey = primaryKeyOf(entry, 1);
  const rows: Array<{ image: string }> = await manager.query(
    `SELECT row_to_json(target)::text AS image FROM ${entry.table} AS target WHERE ${primaryKey.predicate}`,
    primaryKey.values,
  );

  return rows[0]?.image;
}

function childrenFirstTables(): readonly LedgeredTable[] {
  return [...LEDGERED_TABLES].reverse();
}

function orderedByTable(
  entries: readonly AuditEntry[],
  tables: readonly LedgeredTable[],
): AuditEntry[] {
  return tables.flatMap((table) => entries.filter((entry) => entry.table === table));
}

function primaryKeyOf(
  entry: AuditEntry,
  firstParameterIndex: number,
): { predicate: string; values: unknown[] } {
  const addressableValues: Record<string, unknown> = {
    id: entry.rowId,
    created_at: entry.rowCreatedAt,
  };
  const columns = PRIMARY_KEY_COLUMNS[entry.table];

  // Always qualified: the rewrite below joins the pre-image in as a second
  // relation, where a bare column name would be ambiguous.
  return {
    predicate: columns
      .map((column, index) => `target.${column} = $${firstParameterIndex + index}`)
      .join(' AND '),
    values: columns.map((column) => addressableValues[column]),
  };
}

function parseImage(image: string): Record<string, unknown> {
  return JSON.parse(image) as Record<string, unknown>;
}

/** Both sides come from `row_to_json` on the same table, so equal values always serialize alike. */
function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function describe(entry: AuditEntry): string {
  return `${entry.table} row ${entry.rowId}`;
}

async function withLedgerSchemaLock(
  dataSource: DataSource,
  action: () => Promise<void>,
): Promise<void> {
  const lockHolder = dataSource.createQueryRunner();
  await lockHolder.connect();

  try {
    await lockHolder.query('SELECT pg_advisory_lock($1)', [LEDGER_SCHEMA_LOCK_KEY]);
    await action();
  } finally {
    await lockHolder.query('SELECT pg_advisory_unlock($1)', [LEDGER_SCHEMA_LOCK_KEY]);
    await lockHolder.release();
  }
}

async function createLedgerObjectsIfAbsent(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `CREATE TABLE IF NOT EXISTS ${RUNS_TABLE} (run_id text PRIMARY KEY, record_prefix text NOT NULL)`,
  );

  // `row_id`, `row_created_at` and `table_name` are nullable for the sake of
  // the `OPEN` entry alone, which marks a ledger rather than a row.
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      entry_number bigserial PRIMARY KEY,
      run_id text NOT NULL,
      operation text NOT NULL,
      table_name text,
      row_id uuid,
      row_created_at timestamptz,
      pre_image json,
      post_image json
    )
  `);

  await dataSource.query(`
    CREATE OR REPLACE FUNCTION ${AUDIT_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      writer text := current_setting('application_name', true);
    BEGIN
      IF writer IS NULL OR NOT starts_with(writer, '${LEDGER_MARKER_PREFIX}') THEN
        RETURN NULL;
      END IF;

      IF TG_OP = 'INSERT' THEN
        INSERT INTO ${AUDIT_TABLE} (run_id, operation, table_name, row_id, row_created_at, pre_image, post_image)
        VALUES (writer, TG_OP, TG_ARGV[0], NEW.id, NEW.created_at, NULL, row_to_json(NEW));
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO ${AUDIT_TABLE} (run_id, operation, table_name, row_id, row_created_at, pre_image, post_image)
        VALUES (writer, TG_OP, TG_ARGV[0], OLD.id, OLD.created_at, row_to_json(OLD), row_to_json(NEW));
      ELSE
        INSERT INTO ${AUDIT_TABLE} (run_id, operation, table_name, row_id, row_created_at, pre_image, post_image)
        VALUES (writer, TG_OP, TG_ARGV[0], OLD.id, OLD.created_at, row_to_json(OLD), NULL);
      END IF;

      RETURN NULL;
    END;
    $$
  `);

  for (const table of LEDGERED_TABLES) {
    if (await hasAuditTrigger(dataSource, table)) {
      continue;
    }

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

async function hasAuditTrigger(dataSource: DataSource, table: LedgeredTable): Promise<boolean> {
  const [state]: Array<{ present: boolean }> = await dataSource.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_trigger AS audit_trigger
       JOIN pg_class AS ledgered ON ledgered.oid = audit_trigger.tgrelid
       JOIN pg_namespace AS ledgered_schema ON ledgered_schema.oid = ledgered.relnamespace
       WHERE audit_trigger.tgname = $1 AND NOT audit_trigger.tgisinternal
         AND ledgered_schema.nspname = 'public' AND ledgered.relname = $2
     ) AS present`,
    [AUDIT_TRIGGER, table],
  );

  return Boolean(state?.present);
}

/**
 * Forgets runs that are enrolled but no longer connected, and the entries they
 * never got to undo — the residue of a run killed mid-test, which would
 * otherwise keep the shared objects alive in a developer's database forever.
 */
async function discardCrashedRuns(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `DELETE FROM ${RUNS_TABLE} AS enrolled
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_stat_activity AS session WHERE session.application_name = enrolled.run_id
     )`,
  );
  await dataSource.query(
    `DELETE FROM ${AUDIT_TABLE} WHERE run_id NOT IN (SELECT run_id FROM ${RUNS_TABLE})`,
  );
}

async function ledgerObjectsExist(dataSource: DataSource): Promise<boolean> {
  const [state]: Array<{ present: boolean }> = await dataSource.query(
    `SELECT to_regclass($1) IS NOT NULL AND to_regclass($2) IS NOT NULL AS present`,
    [AUDIT_TABLE, RUNS_TABLE],
  );

  return Boolean(state?.present);
}

async function dropLedgerObjects(dataSource: DataSource): Promise<void> {
  for (const table of LEDGERED_TABLES) {
    await dataSource.query(`DROP TRIGGER IF EXISTS ${AUDIT_TRIGGER} ON ${table}`);
  }

  await dataSource.query(`DROP FUNCTION IF EXISTS ${AUDIT_FUNCTION}()`);
  await dataSource.query(`DROP TABLE IF EXISTS ${AUDIT_TABLE}`);
  await dataSource.query(`DROP TABLE IF EXISTS ${RUNS_TABLE}`);
}
