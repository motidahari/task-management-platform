import {
  isNullish,
  isValidBigInt,
  isValidBoolean,
  isValidDate,
  isValidEnum,
  isValidNumber,
  isValidObject,
  isValidString,
  isValidUuid,
} from '../../src/validation';

describe('validators', () => {
  const A_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  describe('isValidString', () => {
    describe('Given:absence handling', () => {
      it('should reject undefined and null by default', () => {
        expect(isValidString(undefined)).toBe(false);
        expect(isValidString(null)).toBe(false);
      });

      it('should accept undefined when optional and null when nullable', () => {
        expect(isValidString(undefined, { optional: true })).toBe(true);
        expect(isValidString(null, { nullable: true })).toBe(true);
      });
    });

    describe('Given:required (default)', () => {
      it('should reject an empty or whitespace-only string', () => {
        expect(isValidString('')).toBe(false);
        expect(isValidString('   ')).toBe(false);
      });

      it('should accept a whitespace-only string when required is false', () => {
        expect(isValidString('   ', { required: false })).toBe(true);
      });
    });

    describe('Given:length and pattern bounds', () => {
      it('should enforce min and max length inclusively', () => {
        expect(isValidString('ab', { min: 2, max: 3 })).toBe(true);
        expect(isValidString('a', { min: 2 })).toBe(false);
        expect(isValidString('abcd', { max: 3 })).toBe(false);
      });

      it('should enforce a regex pattern', () => {
        expect(isValidString('abc', { pattern: /^[a-z]+$/ })).toBe(true);
        expect(isValidString('ABC', { pattern: /^[a-z]+$/ })).toBe(false);
      });
    });

    it('should reject non-string values', () => {
      expect(isValidString(42)).toBe(false);
    });
  });

  describe('isValidNumber', () => {
    it('should reject NaN, Infinity and non-numbers', () => {
      expect(isValidNumber(Number.NaN)).toBe(false);
      expect(isValidNumber(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidNumber('1')).toBe(false);
    });

    it('should enforce integer, positive, min and max', () => {
      expect(isValidNumber(1.5, { integer: true })).toBe(false);
      expect(isValidNumber(0, { positive: true })).toBe(false);
      expect(isValidNumber(5, { min: 1, max: 10 })).toBe(true);
      expect(isValidNumber(0, { min: 1 })).toBe(false);
    });

    it('should accept a plain finite number by default', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-3.2)).toBe(true);
    });
  });

  describe('isValidBoolean', () => {
    it('should accept only real booleans', () => {
      expect(isValidBoolean(true)).toBe(true);
      expect(isValidBoolean(false)).toBe(true);
      expect(isValidBoolean(0)).toBe(false);
      expect(isValidBoolean('true')).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should accept a valid Date and reject an invalid one', () => {
      expect(isValidDate(new Date('2026-01-01'))).toBe(true);
      expect(isValidDate(new Date('not-a-date'))).toBe(false);
    });

    it('should reject a date-like string', () => {
      expect(isValidDate('2026-01-01')).toBe(false);
    });
  });

  describe('isValidObject', () => {
    it('should accept a plain object and reject arrays by default', () => {
      expect(isValidObject({})).toBe(true);
      expect(isValidObject([])).toBe(false);
    });

    it('should accept arrays when allowArray is set', () => {
      expect(isValidObject([], { allowArray: true })).toBe(true);
    });

    it('should reject primitives', () => {
      expect(isValidObject('x')).toBe(false);
    });
  });

  describe('isValidEnum', () => {
    enum Color {
      Red = 'red',
      Blue = 'blue',
    }

    it('should accept a member value and reject a non-member', () => {
      expect(isValidEnum('red', Color)).toBe(true);
      expect(isValidEnum('green', Color)).toBe(false);
    });
  });

  describe('isValidUuid', () => {
    it('should accept a well-formed UUID and reject malformed input', () => {
      expect(isValidUuid(A_UUID)).toBe(true);
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid(42)).toBe(false);
    });
  });

  describe('isValidBigInt', () => {
    it('should accept a bigint and reject a number', () => {
      expect(isValidBigInt(1n)).toBe(true);
      expect(isValidBigInt(1)).toBe(false);
    });
  });

  describe('isNullish', () => {
    it('should be true only for null and undefined', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
    });
  });
});
