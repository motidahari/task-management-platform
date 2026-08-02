import { ErrorCode, errorCodeName } from '@core/shared/error-codes';
import type { ErrorResponse } from '@core/shared/errors/error-response';
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';

import { appConfig } from '../config/app.config';
import type { ApiError } from '../types/api-error';

const REQUEST_TIMEOUT_MS = 10_000;
const SERVER_ERROR_STATUS_THRESHOLD = 500;

/**
 * Owns everything transport-level for the whole app: base URL, headers,
 * timeout, and the single place a raw axios failure becomes a typed
 * `ApiError`. Domain services extend this and call only `get`/`post`/`patch`
 * with relative paths — they never see axios, the host, or the port.
 */
export abstract class BaseHttpService {
  private readonly http: AxiosInstance;

  protected constructor() {
    this.http = axios.create({
      baseURL: appConfig.apiBaseUrl,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });

    this.http.interceptors.response.use(
      (response: AxiosResponse): AxiosResponse => response,
      // ApiError is the typed contract every store's catch expects — wrapping
      // it in an Error would force every call site to unwrap it again.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      (error: unknown): Promise<never> => Promise.reject(this.toLoggedApiError(error)),
    );
  }

  protected async get<TResponse>(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<TResponse> {
    const response = await this.http.get<TResponse>(path, { params });
    return response.data;
  }

  protected async post<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    const response = await this.http.post<TResponse>(path, body);
    return response.data;
  }

  protected async patch<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    const response = await this.http.patch<TResponse>(path, body);
    return response.data;
  }

  /** Maps the failure, then logs 5xx/network failures centrally — every other failure is silent here. */
  private toLoggedApiError(error: unknown): ApiError {
    const apiError = toApiError(error);
    logNoteworthyFailure(apiError, error);
    return apiError;
  }
}

/** The one place a 5xx or network failure gets a log line — every other failure stays silent here. */
function logNoteworthyFailure(apiError: ApiError, cause: unknown): void {
  if (apiError.isNetworkError || apiError.status >= SERVER_ERROR_STATUS_THRESHOLD) {
    console.error('[http] request failed', {
      status: apiError.status,
      errorCode: apiError.errorCode,
      isNetworkError: apiError.isNetworkError,
      cause,
    });
  }
}

/**
 * The shape a store reaches for when it detects a "should never happen"
 * condition of its own — never a request, so there is no axios failure to
 * map — but that still needs to end a store action the same way a real
 * server failure does: a typed `ApiError` the terminal catch can toast, and
 * a log line through the app's one central failure log. `status: 500` isn't
 * a real response status here, but it's the status `INTERNAL_ERROR`'s own
 * numbering already commits to (`errorCode = HTTP status × 100 + serial`),
 * so it stays truthful about how the failure is classified without
 * pretending a response of any kind was involved — unlike pairing it with
 * `status: 0`, which the network-failure path already owns and means
 * something different (no response reached us at all).
 */
export function toInternalClientApiError(cause: unknown): ApiError {
  const apiError: ApiError = {
    errorCode: ErrorCode.INTERNAL_ERROR,
    status: SERVER_ERROR_STATUS_THRESHOLD,
    isNetworkError: false,
  };
  logNoteworthyFailure(apiError, cause);
  return apiError;
}

interface AxiosErrorLike {
  readonly response?: { readonly status: number; readonly data: unknown };
}

function isAxiosErrorLike(error: unknown): error is AxiosErrorLike {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

/** No response reached us (offline, timeout, DNS, CORS) — there is no envelope to read. */
function toNetworkApiError(): ApiError {
  return { errorCode: ErrorCode.INTERNAL_ERROR, status: 0, isNetworkError: true };
}

function toApiError(error: unknown): ApiError {
  if (!isAxiosErrorLike(error) || !error.response) {
    return toNetworkApiError();
  }

  const { status, data } = error.response;

  return {
    errorCode: envelopeErrorCode(data),
    status,
    details: envelopeDetails(data),
    isNetworkError: false,
  };
}

/** Unknown/out-of-range codes and malformed bodies degrade to `INTERNAL_ERROR` rather than propagate garbage. */
function envelopeErrorCode(data: unknown): ErrorCode {
  if (!isErrorEnvelope(data) || errorCodeName(data.errorCode) === 'UNREGISTERED') {
    return ErrorCode.INTERNAL_ERROR;
  }

  return data.errorCode;
}

function envelopeDetails(data: unknown): ErrorResponse['details'] {
  return isErrorEnvelope(data) ? data.details : undefined;
}

function isErrorEnvelope(data: unknown): data is ErrorResponse {
  return typeof data === 'object' && data !== null && 'errorCode' in data && 'errorMessage' in data;
}
