import { ErrorCode } from '@core/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseHttpService } from './BaseHttpService';

const { httpMockInstance, createMock } = vi.hoisted(() => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };

  return { httpMockInstance: instance, createMock: vi.fn(() => instance) };
});

vi.mock('axios', () => ({
  default: { create: createMock },
}));

class TestHttpService extends BaseHttpService {
  constructor() {
    super();
  }

  fetchOne<TResponse>(path: string): Promise<TResponse> {
    return this.get<TResponse>(path);
  }

  createOne<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    return this.post<TResponse>(path, body);
  }

  updateOne<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    return this.patch<TResponse>(path, body);
  }
}

function rejectionHandler(): (error: unknown) => Promise<never> {
  const [, onRejected] = httpMockInstance.interceptors.response.use.mock.calls.at(-1) as [
    unknown,
    (error: unknown) => Promise<never>,
  ];

  return onRejected;
}

describe('BaseHttpService, Given:a subclass making relative-path requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should forward GET to the shared axios instance and resolve with the response body', async () => {
    httpMockInstance.get.mockResolvedValueOnce({ data: { id: 'task-1' } });
    const service = new TestHttpService();

    const result = await service.fetchOne('/tasks/task-1');

    expect(httpMockInstance.get).toHaveBeenCalledWith('/tasks/task-1', { params: undefined });
    expect(result).toEqual({ id: 'task-1' });
  });

  it('should forward POST with its body and resolve with the response body', async () => {
    httpMockInstance.post.mockResolvedValueOnce({ data: { id: 'task-2' } });
    const service = new TestHttpService();

    const result = await service.createOne('/tasks', { title: 'New task' });

    expect(httpMockInstance.post).toHaveBeenCalledWith('/tasks', { title: 'New task' });
    expect(result).toEqual({ id: 'task-2' });
  });

  it('should forward PATCH with its body and resolve with the response body', async () => {
    httpMockInstance.patch.mockResolvedValueOnce({ data: { id: 'task-3' } });
    const service = new TestHttpService();

    const result = await service.updateOne('/tasks/task-3/status', { direction: 'forward' });

    expect(httpMockInstance.patch).toHaveBeenCalledWith('/tasks/task-3/status', {
      direction: 'forward',
    });
    expect(result).toEqual({ id: 'task-3' });
  });
});

describe('BaseHttpService, Given:a server response carrying the error envelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should map errorCode, status and details onto the rejected ApiError', async () => {
    new TestHttpService();
    const onRejected = rejectionHandler();

    const axiosError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          errorCode: ErrorCode.TASK_STATE_CONFLICT,
          errorMessage: 'Task state changed',
          details: { currentStatus: 40200 },
        },
      },
    };

    await expect(onRejected(axiosError)).rejects.toEqual({
      errorCode: ErrorCode.TASK_STATE_CONFLICT,
      status: 409,
      details: { currentStatus: 40200 },
      isNetworkError: false,
    });
  });

  it('should degrade an unrecognized errorCode to INTERNAL_ERROR', async () => {
    new TestHttpService();
    const onRejected = rejectionHandler();

    const axiosError = {
      isAxiosError: true,
      response: { status: 400, data: { errorCode: 99999, errorMessage: 'Unknown' } },
    };

    await expect(onRejected(axiosError)).rejects.toEqual({
      errorCode: ErrorCode.INTERNAL_ERROR,
      status: 400,
      details: undefined,
      isNetworkError: false,
    });
  });

  it('should degrade a response with no valid envelope to INTERNAL_ERROR', async () => {
    new TestHttpService();
    const onRejected = rejectionHandler();

    const axiosError = {
      isAxiosError: true,
      response: { status: 502, data: '<html>Bad Gateway</html>' },
    };

    await expect(onRejected(axiosError)).rejects.toEqual({
      errorCode: ErrorCode.INTERNAL_ERROR,
      status: 502,
      details: undefined,
      isNetworkError: false,
    });
  });
});

describe('BaseHttpService, Given:no response reached the client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject with isNetworkError true and no HTTP status', async () => {
    new TestHttpService();
    const onRejected = rejectionHandler();

    const axiosError = { isAxiosError: true, request: {} };

    await expect(onRejected(axiosError)).rejects.toEqual({
      errorCode: ErrorCode.INTERNAL_ERROR,
      status: 0,
      isNetworkError: true,
    });
  });
});

describe('BaseHttpService, Given:the central failure logging sink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log a 5xx failure and a network failure', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    new TestHttpService();
    const onRejected = rejectionHandler();

    await onRejected({
      isAxiosError: true,
      response: { status: 500, data: { errorCode: ErrorCode.INTERNAL_ERROR, errorMessage: 'x' } },
    }).catch(() => undefined);
    await onRejected({ isAxiosError: true, request: {} }).catch(() => undefined);

    expect(logSpy).toHaveBeenCalledTimes(2);

    logSpy.mockRestore();
  });

  it('should not log a 4xx failure', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    new TestHttpService();
    const onRejected = rejectionHandler();

    await onRejected({
      isAxiosError: true,
      response: { status: 404, data: { errorCode: ErrorCode.TASK_NOT_FOUND, errorMessage: 'x' } },
    }).catch(() => undefined);

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
