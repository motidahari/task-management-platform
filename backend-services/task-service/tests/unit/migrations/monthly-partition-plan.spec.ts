import type { MonthlyPartitionRange } from '../../../src/migrations/support/monthly-partition-plan';
import { buildMonthlyPartitionPlan } from '../../../src/migrations/support/monthly-partition-plan';

/** Fails fast with the offending index instead of silently asserting on `undefined`. */
function rangeAt(plan: MonthlyPartitionRange[], index: number): MonthlyPartitionRange {
  const range = plan[index];

  if (range === undefined) {
    throw new Error(`expected a partition range at index ${index}, plan has ${plan.length}`);
  }

  return range;
}

describe('buildMonthlyPartitionPlan', () => {
  describe('Given:a mid-year reference date and a 3-month horizon, When:building the plan', () => {
    const plan = buildMonthlyPartitionPlan('task_status_history', new Date('2026-07-30T12:00:00Z'), 3);

    it('should return exactly the current month plus 3 months ahead', () => {
      expect(plan).toHaveLength(4);
    });

    it('should start with the current calendar month', () => {
      expect(plan[0]).toEqual({
        partitionName: 'task_status_history_2026_07',
        rangeStartInclusive: '2026-07-01',
        rangeEndExclusive: '2026-08-01',
      });
    });

    it('should end with the third future month', () => {
      expect(plan[3]).toEqual({
        partitionName: 'task_status_history_2026_10',
        rangeStartInclusive: '2026-10-01',
        rangeEndExclusive: '2026-11-01',
      });
    });

    it('should tile the timeline with no gap and no overlap between consecutive ranges', () => {
      for (let index = 1; index < plan.length; index += 1) {
        expect(rangeAt(plan, index).rangeStartInclusive).toBe(rangeAt(plan, index - 1).rangeEndExclusive);
      }
    });

    it('should never include a catch-all default range', () => {
      const partitionNames = plan.map((range) => range.partitionName);

      expect(partitionNames.some((name) => name.toLowerCase().includes('default'))).toBe(false);
    });
  });

  describe('Given:a reference date on a December year boundary, When:building the plan', () => {
    const plan = buildMonthlyPartitionPlan('task_status_history', new Date('2026-12-05T00:00:00Z'), 3);

    it('should roll the month and year over correctly for every future partition', () => {
      expect(plan.map((range) => range.partitionName)).toEqual([
        'task_status_history_2026_12',
        'task_status_history_2027_01',
        'task_status_history_2027_02',
        'task_status_history_2027_03',
      ]);
    });

    it('should keep December and January ranges contiguous across the year boundary', () => {
      expect(rangeAt(plan, 0).rangeEndExclusive).toBe('2027-01-01');
      expect(rangeAt(plan, 1).rangeStartInclusive).toBe('2027-01-01');
    });
  });

  describe('Given:a reference date mid-month, When:building the plan', () => {
    it('should anchor every range to the first day of its month, ignoring the day-of-month', () => {
      const plan = buildMonthlyPartitionPlan('task_status_history', new Date('2026-03-17T23:59:59Z'), 0);

      expect(plan).toEqual([
        {
          partitionName: 'task_status_history_2026_03',
          rangeStartInclusive: '2026-03-01',
          rangeEndExclusive: '2026-04-01',
        },
      ]);
    });
  });

  describe('Given:a single-digit month, When:naming its partition', () => {
    it('should zero-pad the month segment', () => {
      const plan = buildMonthlyPartitionPlan('task_status_history', new Date('2026-01-01T00:00:00Z'), 0);

      expect(rangeAt(plan, 0).partitionName).toBe('task_status_history_2026_01');
    });
  });
});
