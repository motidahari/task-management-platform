import { type AppException, ErrorCode, type FieldProblemsDetails } from '@core/shared';
import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A forward status move is missing one or more of the fields its target
 * status requires.
 */
export class MissingRequiredFieldsException
  extends UnprocessableEntityException
  implements AppException
{
  readonly errorCode = ErrorCode.MISSING_REQUIRED_FIELDS;
  readonly details: FieldProblemsDetails;

  constructor(targetStatus: number, missingFields: readonly string[]) {
    super(`Missing required fields for status ${targetStatus}`);
    this.name = MissingRequiredFieldsException.name;
    this.details = { missing: missingFields };
  }
}
