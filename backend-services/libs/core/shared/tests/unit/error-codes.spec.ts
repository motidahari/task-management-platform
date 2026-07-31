import { defaultErrorCodeForStatus, ErrorCode, errorCodeName } from '../../src/error-codes';

describe('error-codes', () => {
  /**
   * The published error-code registry, restated independently of the enum. A code
   * is public contract: renumbering one breaks every deployed client, so this
   * table exists to make such a change fail loudly here first.
   */
  const PUBLISHED_REGISTRY: ReadonlyArray<[keyof typeof ErrorCode, number, number]> = [
    ['VALIDATION_ERROR', 40000, 400],
    ['TASK_NOT_FOUND', 40400, 404],
    ['USER_NOT_FOUND', 40401, 404],
    ['TASK_CLOSED', 40900, 409],
    ['TASK_STATE_CONFLICT', 40901, 409],
    ['UNKNOWN_TASK_TYPE', 42200, 422],
    ['ASSIGNEE_NOT_FOUND', 42201, 422],
    ['INVALID_STATUS_TRANSITION', 42202, 422],
    ['MISSING_REQUIRED_FIELDS', 42203, 422],
    ['TASK_NOT_AT_FINAL_STATUS', 42204, 422],
    ['THROTTLED', 42900, 429],
    ['INTERNAL_ERROR', 50000, 500],
  ];

  const memberNames = Object.keys(ErrorCode).filter((key) => Number.isNaN(Number(key)));

  describe('ErrorCode', () => {
    describe('Given:the published registry, When:comparing it to the enum', () => {
      it.each(PUBLISHED_REGISTRY)('should keep %s at %i', (name, expectedCode) => {
        expect(ErrorCode[name]).toBe(expectedCode);
      });

      it('should declare no members beyond the published registry', () => {
        expect(memberNames.sort()).toEqual(PUBLISHED_REGISTRY.map(([name]) => name).sort());
      });
    });

    describe('Given:the numbering convention, When:inspecting each member', () => {
      it.each(PUBLISHED_REGISTRY)(
        'should place %s inside the %i block of its HTTP status',
        (_name, code, httpStatus) => {
          expect(Math.floor(code / 100)).toBe(httpStatus);
        },
      );

      it('should assign a distinct number to every member', () => {
        const codes = memberNames.map((name) => ErrorCode[name as keyof typeof ErrorCode]);

        expect(new Set(codes).size).toBe(codes.length);
      });
    });
  });

  describe('defaultErrorCodeForStatus', () => {
    describe('Given:an HTTP status, When:no specific variant applies', () => {
      it('should return serial 00 of that status block', () => {
        expect(defaultErrorCodeForStatus(429)).toBe(ErrorCode.THROTTLED);
        expect(defaultErrorCodeForStatus(400)).toBe(ErrorCode.VALIDATION_ERROR);
        expect(defaultErrorCodeForStatus(500)).toBe(ErrorCode.INTERNAL_ERROR);
      });
    });
  });

  describe('errorCodeName', () => {
    describe('Given:a registered code, When:naming it for a log line', () => {
      it('should resolve the member name', () => {
        expect(errorCodeName(42203)).toBe('MISSING_REQUIRED_FIELDS');
      });
    });

    describe('Given:a number outside the registry, When:naming it for a log line', () => {
      it('should report it as unregistered rather than throwing', () => {
        expect(errorCodeName(41800)).toBe('UNREGISTERED');
      });
    });
  });
});
