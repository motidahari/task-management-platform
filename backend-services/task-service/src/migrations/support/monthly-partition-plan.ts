/**
 * Deterministic month-range planner for a table range-partitioned on a
 * timestamp column. A pure function of `referenceDate` — it never reads the
 * wall clock itself — so both the migration that provisions the initial
 * partitions and a future scheduled job that tops the horizon back up can
 * share and unit-test the exact same range math instead of each
 * hand-rolling date arithmetic.
 */
export interface MonthlyPartitionRange {
  readonly partitionName: string;
  readonly rangeStartInclusive: string;
  readonly rangeEndExclusive: string;
}

const MONTH_DIGITS = 2;

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUtc(monthStart: Date, monthsToAdd: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + monthsToAdd, 1));
}

function toDateOnlyIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function partitionNameFor(tableName: string, monthStart: Date): string {
  const year = monthStart.getUTCFullYear();
  const month = String(monthStart.getUTCMonth() + 1).padStart(MONTH_DIGITS, '0');

  return `${tableName}_${year}_${month}`;
}

/**
 * The current month plus `monthsAhead` future months — never a past month,
 * never a catch-all range. Each range is `[rangeStartInclusive,
 * rangeEndExclusive)` in UTC calendar months, so consecutive entries tile
 * the timeline with no gap and no overlap, which is exactly what `CREATE
 * TABLE ... PARTITION OF ... FOR VALUES FROM (...) TO (...)` requires to
 * accept every range without a locking data move.
 */
export function buildMonthlyPartitionPlan(
  tableName: string,
  referenceDate: Date,
  monthsAhead: number,
): MonthlyPartitionRange[] {
  const partitionCount = monthsAhead + 1;
  const currentMonthStart = startOfMonthUtc(referenceDate);

  return Array.from({ length: partitionCount }, (_unused, monthOffset) => {
    const rangeStart = addMonthsUtc(currentMonthStart, monthOffset);
    const rangeEnd = addMonthsUtc(currentMonthStart, monthOffset + 1);

    return {
      partitionName: partitionNameFor(tableName, rangeStart),
      rangeStartInclusive: toDateOnlyIso(rangeStart),
      rangeEndExclusive: toDateOnlyIso(rangeEnd),
    };
  });
}
