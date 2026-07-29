import { sanitizeEnumKey } from '../../src/sanitizers/sanitize-enum-key';
import { sanitizeString } from '../../src/sanitizers/sanitize-string';
import { sanitizeUuid } from '../../src/sanitizers/sanitize-uuid';

const NUL = String.fromCharCode(0x00);
const ESCAPE = String.fromCharCode(0x1b);

const NON_STRING_VALUES: ReadonlyArray<[string, unknown]> = [
  ['a number', 42],
  ['null', null],
  ['undefined', undefined],
  ['an object', { key: 'value' }],
  ['an array', ['value']],
];

describe('sanitizeString', () => {
  describe('Given:surrounding and inner whitespace, When:sanitizing', () => {
    it('should trim the ends', () => {
      expect(sanitizeString('  padded  ')).toBe('padded');
    });

    it('should collapse an inner whitespace run to a single space', () => {
      expect(sanitizeString('two    words')).toBe('two words');
    });

    it('should collapse a newline into a space instead of gluing the words', () => {
      expect(sanitizeString('first\nsecond')).toBe('first second');
    });

    it('should collapse tabs the same way', () => {
      expect(sanitizeString('first\t\tsecond')).toBe('first second');
    });
  });

  describe('Given:control characters, When:sanitizing', () => {
    it('should remove a NUL byte', () => {
      expect(sanitizeString(`clean${NUL}value`)).toBe('cleanvalue');
    });

    it('should remove an escape character', () => {
      expect(sanitizeString(`colour${ESCAPE}[31mcode`)).toBe('colour[31mcode');
    });

    it('should leave no double space behind a removed control character', () => {
      expect(sanitizeString(`first ${NUL} second`)).toBe('first second');
    });

    it('should remove every character in the 0x00-0x1F range', () => {
      const allControlChars = Array.from({ length: 0x20 }, (_unused, code) =>
        String.fromCharCode(code),
      ).join('');

      expect(sanitizeString(`a${allControlChars}b`)).toBe('a b');
    });
  });

  describe('Given:content that looks like markup, When:sanitizing', () => {
    it('should preserve angle brackets rather than stripping tags', () => {
      expect(sanitizeString('List<string> where a < b')).toBe('List<string> where a < b');
    });

    it('should preserve a script tag verbatim, because escaping belongs to the renderer', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
    });
  });

  describe('Given:an empty or whitespace-only value, When:sanitizing', () => {
    it('should return an empty string', () => {
      expect(sanitizeString('   \n\t  ')).toBe('');
    });
  });

  describe('Given:a non-string value, When:sanitizing', () => {
    it.each(NON_STRING_VALUES)('should pass %s through untouched', (_label, value) => {
      expect(sanitizeString(value)).toBe(value);
    });
  });
});

describe('sanitizeEnumKey', () => {
  describe('Given:a key with stray casing or whitespace, When:sanitizing', () => {
    it('should trim and lowercase it', () => {
      expect(sanitizeEnumKey('  FORWARD ')).toBe('forward');
    });

    it('should leave an already-normalized key unchanged', () => {
      expect(sanitizeEnumKey('procurement')).toBe('procurement');
    });
  });

  describe('Given:a non-string value, When:sanitizing', () => {
    it.each(NON_STRING_VALUES)('should pass %s through untouched', (_label, value) => {
      expect(sanitizeEnumKey(value)).toBe(value);
    });
  });
});

describe('sanitizeUuid', () => {
  describe('Given:a uuid with surrounding whitespace, When:sanitizing', () => {
    it('should trim it', () => {
      expect(sanitizeUuid(' 0f14d0ab-9605-4a62-a9e4-5ed26688389b ')).toBe(
        '0f14d0ab-9605-4a62-a9e4-5ed26688389b',
      );
    });

    it('should preserve casing so the validator sees what the client sent', () => {
      expect(sanitizeUuid('0F14D0AB-9605-4A62-A9E4-5ED26688389B')).toBe(
        '0F14D0AB-9605-4A62-A9E4-5ED26688389B',
      );
    });
  });

  describe('Given:a non-string value, When:sanitizing', () => {
    it.each(NON_STRING_VALUES)('should pass %s through untouched', (_label, value) => {
      expect(sanitizeUuid(value)).toBe(value);
    });
  });
});
