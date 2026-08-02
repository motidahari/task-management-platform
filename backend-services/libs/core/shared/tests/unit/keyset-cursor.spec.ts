import { ValidationException } from '../../src/errors/validation.exception';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../src/dao/keyset-cursor';

describe('keyset-cursor', () => {
  describe('Given:a cursor carrying a full microsecond-precision timestamp, When:round-tripping it through encode then decode', () => {
    it('should preserve every digit rather than truncating to millisecond precision', () => {
      const original = { createdAt: '2026-08-02T09:45:30.757772Z', id: 'row-1' };

      const decoded = decodeKeysetCursor(encodeKeysetCursor(original));

      expect(decoded).toEqual(original);
    });
  });

  describe('Given:a cursor with an all-zero microsecond fraction, When:round-tripping it', () => {
    it('should keep the trailing zeros rather than dropping the fraction', () => {
      const original = { createdAt: '2026-08-02T09:45:30.000000Z', id: 'row-2' };

      const decoded = decodeKeysetCursor(encodeKeysetCursor(original));

      expect(decoded).toEqual(original);
    });
  });

  describe('Given:a cursor whose timestamp carries only millisecond precision (issued before this fix), When:decoding it', () => {
    it('should right-pad the fraction to six digits rather than reject it', () => {
      const legacyCursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-02T09:45:30.757Z', id: 'row-3' }),
      ).toString('base64url');

      expect(decodeKeysetCursor(legacyCursor)).toEqual({
        createdAt: '2026-08-02T09:45:30.757000Z',
        id: 'row-3',
      });
    });
  });

  describe('Given:a cursor whose timestamp carries no fractional part at all, When:decoding it', () => {
    it('should treat the fraction as all zeros', () => {
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-02T09:45:30Z', id: 'row-4' }),
      ).toString('base64url');

      expect(decodeKeysetCursor(cursor)).toEqual({
        createdAt: '2026-08-02T09:45:30.000000Z',
        id: 'row-4',
      });
    });
  });

  describe('Given:a value that is not valid base64url, When:decoding it', () => {
    it('should throw ValidationException', () => {
      expect(() => decodeKeysetCursor('not-a-valid-cursor')).toThrow(ValidationException);
    });
  });

  describe('Given:base64 that decodes to something other than JSON, When:decoding it', () => {
    it('should throw ValidationException', () => {
      const garbage = Buffer.from('not json at all').toString('base64url');

      expect(() => decodeKeysetCursor(garbage)).toThrow(ValidationException);
    });
  });

  describe('Given:well-formed JSON of the wrong shape, When:decoding it', () => {
    it('should throw ValidationException', () => {
      const wrongShape = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');

      expect(() => decodeKeysetCursor(wrongShape)).toThrow(ValidationException);
    });
  });

  describe('Given:JSON with an id that is an empty string, When:decoding it', () => {
    it('should throw ValidationException', () => {
      const emptyId = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-02T09:45:30.000000Z', id: '  ' }),
      ).toString('base64url');

      expect(() => decodeKeysetCursor(emptyId)).toThrow(ValidationException);
    });
  });

  describe('Given:JSON with a createdAt that is not a timestamp at all, When:decoding it', () => {
    it('should throw ValidationException', () => {
      const badTimestamp = Buffer.from(
        JSON.stringify({ createdAt: 'not-a-timestamp', id: 'row-5' }),
      ).toString('base64url');

      expect(() => decodeKeysetCursor(badTimestamp)).toThrow(ValidationException);
    });
  });

  describe('Given:JSON with a createdAt carrying a timezone offset instead of Z, When:decoding it', () => {
    it('should throw ValidationException rather than silently accept a non-UTC value', () => {
      const offsetTimestamp = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-02T09:45:30.757772+00:00', id: 'row-6' }),
      ).toString('base64url');

      expect(() => decodeKeysetCursor(offsetTimestamp)).toThrow(ValidationException);
    });
  });

  describe('Given:JSON with a createdAt fraction longer than six digits, When:decoding it', () => {
    it('should throw ValidationException rather than truncate it silently', () => {
      const tooPrecise = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-02T09:45:30.7577721Z', id: 'row-7' }),
      ).toString('base64url');

      expect(() => decodeKeysetCursor(tooPrecise)).toThrow(ValidationException);
    });
  });
});
