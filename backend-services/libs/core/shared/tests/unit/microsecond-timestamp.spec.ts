import { ValidationException } from '../../src/errors/validation.exception';
import {
  toMicrosecondIso,
  utcTimestampTextExpression,
} from '../../src/serialization/microsecond-timestamp';

describe('microsecond-timestamp', () => {
  describe('toMicrosecondIso', () => {
    describe('Given:a UTC timestamp text with no fractional part, When:converting', () => {
      it('should append an all-zero microsecond fraction', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00')).toBe('2026-07-30T12:00:00.000000Z');
      });
    });

    describe('Given:a two-digit fraction, When:converting', () => {
      it('should right-pad it to six digits rather than treating it as micros already', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00.12')).toBe('2026-07-30T12:00:00.120000Z');
      });
    });

    describe('Given:a fraction already carrying trailing zeros, When:converting', () => {
      it('should leave it unchanged', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00.120000')).toBe('2026-07-30T12:00:00.120000Z');
      });
    });

    describe('Given:a full six-digit fraction, When:converting', () => {
      it('should pass it through untouched', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00.987654')).toBe('2026-07-30T12:00:00.987654Z');
      });
    });

    describe('Given:a one-digit fraction, When:converting', () => {
      it('should right-pad it to six digits', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00.5')).toBe('2026-07-30T12:00:00.500000Z');
      });
    });

    describe('Given:every valid output, When:converting', () => {
      it('should always be 27 characters long', () => {
        expect(toMicrosecondIso('2026-07-30 12:00:00').length).toBe(27);
        expect(toMicrosecondIso('2026-07-30 12:00:00.987654').length).toBe(27);
      });
    });

    describe('Given:a value already carrying a timezone offset, When:converting', () => {
      it('should throw ValidationException', () => {
        expect(() => toMicrosecondIso('2026-07-30 12:00:00+00')).toThrow(ValidationException);
      });
    });

    describe('Given:a value using the T separator instead of a space, When:converting', () => {
      it('should throw ValidationException', () => {
        expect(() => toMicrosecondIso('2026-07-30T12:00:00')).toThrow(ValidationException);
      });
    });

    describe('Given:a fraction over six digits, When:converting', () => {
      it('should throw ValidationException', () => {
        expect(() => toMicrosecondIso('2026-07-30 12:00:00.1234567')).toThrow(ValidationException);
      });
    });

    describe('Given:a completely malformed value, When:converting', () => {
      it('should throw ValidationException', () => {
        expect(() => toMicrosecondIso('not-a-timestamp')).toThrow(ValidationException);
      });
    });

    describe('Given:an empty string, When:converting', () => {
      it('should throw ValidationException', () => {
        expect(() => toMicrosecondIso('')).toThrow(ValidationException);
      });
    });
  });

  describe('utcTimestampTextExpression', () => {
    describe('Given:a qualified column reference, When:building the expression', () => {
      it('should wrap it in the UTC-cast SQL fragment', () => {
        expect(utcTimestampTextExpression('task.updated_at')).toBe(
          `(task.updated_at AT TIME ZONE 'UTC')::text`,
        );
      });
    });
  });
});
