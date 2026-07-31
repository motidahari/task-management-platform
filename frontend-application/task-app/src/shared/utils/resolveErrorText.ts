import type { TFunction } from 'i18next';

import type { ApiError } from '../../core/types/api-error';
import { ERROR_TEXT_KEYS } from './errorTextKeys';

/**
 * THE display rule for a failed request, applied in exactly one place: the
 * server's own `errorMessage` never reaches the DOM, however well-authored it
 * is — the client owns its own wording per `errorCode` so copy stays under
 * product control regardless of backend release cadence, and no upstream
 * string (authored or not) can ever put text in front of the user. A network
 * failure has no envelope to read a code from, so it is handled first; an
 * unmapped code (including `INTERNAL_ERROR`, deliberately left out of
 * `ERROR_TEXT_KEYS`) degrades to the same generic copy. Switching the product
 * to server-authored messages later is a one-function change, here.
 */
export function resolveErrorText(apiError: ApiError, translate: TFunction): string {
  if (apiError.isNetworkError) {
    return translate('shared-errors.network');
  }

  const key = ERROR_TEXT_KEYS[apiError.errorCode];
  return translate(key ?? 'shared-errors.generic');
}
