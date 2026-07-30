import { FieldValidatorService } from '../../../src/task-type/field-validator.service';
import { FieldValidationResult } from '../../../src/task-type/interfaces/field-validation-result.interface';
import { StatusDefinition } from '../../../src/task-type/interfaces/task-type-definition.interface';

const TARGET_STATUS: StatusDefinition = {
  status: 2,
  name: 'supplier-offers-received',
  displayName: 'Supplier offers received',
  requiredFields: [
    { key: 'quote1', label: 'Price quote 1', fieldType: 'string', maxLength: 10 },
    {
      key: 'versionNumber',
      label: 'Version number',
      fieldType: 'string',
      maxLength: 50,
      pattern: '^\\d+\\.\\d+\\.\\d+$',
    },
    { key: 'quantity', label: 'Quantity', fieldType: 'number', min: 1, max: 100 },
  ],
};

/** Declared on a different status of the same task type — must never be accepted here. */
const OTHER_STATUS_FIELD_KEY = 'receipt';

function validPayload(): Record<string, unknown> {
  return { quote1: 'best price', versionNumber: '1.4.2', quantity: 10 };
}

/** Narrows a result to its failure branch and asserts one key was rejected under `invalid`. */
function expectInvalidKey(result: FieldValidationResult, key: string): void {
  expect(result.valid).toBe(false);

  if (result.valid) {
    return;
  }

  expect(typeof result.invalid[key]).toBe('string');
}

describe('FieldValidatorService', () => {
  const validator = new FieldValidatorService();

  describe('Given:a payload with every required field present and within bounds, When:validating', () => {
    it('should accept a valid string field', () => {
      const result = validator.validate(validPayload(), TARGET_STATUS);

      expect(result).toEqual({
        valid: true,
        sanitizedFields: { quote1: 'best price', versionNumber: '1.4.2', quantity: 10 },
      });
    });

    it('should accept a valid number field', () => {
      const result = validator.validate(validPayload(), TARGET_STATUS);

      expect(result.valid).toBe(true);
      expect(result.valid && result.sanitizedFields.quantity).toBe(10);
    });
  });

  describe('Given:a descriptor key absent from the payload, When:validating', () => {
    it('should collect it into missing', () => {
      const payloadMissingQuote1 = { versionNumber: '1.4.2', quantity: 10 };

      const result = validator.validate(payloadMissingQuote1, TARGET_STATUS);

      expect(result).toEqual({ valid: false, missing: ['quote1'], invalid: {} });
    });
  });

  describe('Given:a string value that sanitizes down to empty, When:validating', () => {
    it('should treat it as missing rather than an empty string', () => {
      const result = validator.validate({ ...validPayload(), quote1: '   ' }, TARGET_STATUS);

      expect(result).toEqual({ valid: false, missing: ['quote1'], invalid: {} });
    });
  });

  describe('Given:a value of the wrong type, When:validating', () => {
    it('should reject a number submitted where a string is required', () => {
      const result = validator.validate({ ...validPayload(), quote1: 123 }, TARGET_STATUS);

      expectInvalidKey(result, 'quote1');
    });

    it('should reject a string submitted where a number is required', () => {
      const result = validator.validate({ ...validPayload(), quantity: '10' }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });
  });

  describe('Given:a string longer than the descriptor maxLength, When:validating', () => {
    it('should reject it rather than truncate it', () => {
      const result = validator.validate(
        { ...validPayload(), quote1: 'this is way too long' },
        TARGET_STATUS,
      );

      expectInvalidKey(result, 'quote1');
    });
  });

  describe('Given:a string that does not match the descriptor pattern, When:validating', () => {
    it('should collect it into invalid', () => {
      const result = validator.validate(
        { ...validPayload(), versionNumber: 'not-a-version' },
        TARGET_STATUS,
      );

      expectInvalidKey(result, 'versionNumber');
    });
  });

  describe('Given:a key that is required by a different status of the same type, When:validating', () => {
    it('should reject it as invalid rather than accept it', () => {
      const result = validator.validate(
        { ...validPayload(), [OTHER_STATUS_FIELD_KEY]: 'a receipt' },
        TARGET_STATUS,
      );

      expectInvalidKey(result, OTHER_STATUS_FIELD_KEY);
    });
  });

  describe('Given:a key the type never declares anywhere, When:validating', () => {
    it('should reject it as invalid', () => {
      const result = validator.validate(
        { ...validPayload(), totallyUnknownField: 'value' },
        TARGET_STATUS,
      );

      expectInvalidKey(result, 'totallyUnknownField');
    });
  });

  describe('Given:a string containing control characters, When:validating', () => {
    it('should strip them and accept the sanitized value', () => {
      const withControlChars = `a${String.fromCharCode(0x00)}b${String.fromCharCode(0x07)}c`;

      const result = validator.validate(
        { ...validPayload(), quote1: withControlChars },
        TARGET_STATUS,
      );

      expect(result.valid).toBe(true);
      expect(result.valid && result.sanitizedFields.quote1).toBe('abc');
    });
  });

  describe('Given:NaN submitted for a number field, When:validating', () => {
    it('should reject it as invalid', () => {
      const result = validator.validate({ ...validPayload(), quantity: NaN }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });
  });

  describe('Given:Infinity submitted for a number field, When:validating', () => {
    it('should reject it as invalid', () => {
      const result = validator.validate({ ...validPayload(), quantity: Infinity }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });
  });

  describe('Given:a numeric string submitted for a number field, When:validating', () => {
    it('should reject it rather than coerce it', () => {
      const result = validator.validate({ ...validPayload(), quantity: '42' }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });
  });

  describe('Given:a number outside the declared min/max bounds, When:validating', () => {
    it('should reject a value below min', () => {
      const result = validator.validate({ ...validPayload(), quantity: 0 }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });

    it('should reject a value above max', () => {
      const result = validator.validate({ ...validPayload(), quantity: 1000 }, TARGET_STATUS);

      expectInvalidKey(result, 'quantity');
    });
  });

  describe('Given:a payload carrying a prototype-polluting key, When:validating', () => {
    it('should reject "__proto__" as an ordinary unknown key without touching the object prototype', () => {
      const payload = JSON.parse(
        '{"quote1":"best price","versionNumber":"1.4.2","quantity":10,"__proto__":"polluted"}',
      ) as Record<string, unknown>;

      const result = validator.validate(payload, TARGET_STATUS);

      expectInvalidKey(result, '__proto__');
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  describe('Given:a submitted key padded with whitespace around a real descriptor key, When:validating', () => {
    it('should trim the key before matching it and accept the value', () => {
      const payloadWithPaddedKey = {
        ' quote1 ': 'best price',
        versionNumber: '1.4.2',
        quantity: 10,
      };

      const result = validator.validate(payloadWithPaddedKey, TARGET_STATUS);

      expect(result).toEqual({
        valid: true,
        sanitizedFields: { quote1: 'best price', versionNumber: '1.4.2', quantity: 10 },
      });
    });
  });
});
