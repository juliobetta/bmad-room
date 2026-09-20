import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, test, vi } from 'vitest';
import { createRequestListener, handlePrepareFailure, handleServerError } from './http-server';

function makeRes(): ServerResponse {
  return {
    statusCode: 200,
    end: vi.fn(),
  } as unknown as ServerResponse;
}

describe('createRequestListener()', () => {
  test('a rejecting handler logs the error and responds 500', async () => {
    const res = makeRes();
    const handle = vi.fn().mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const listener = createRequestListener(handle);
    listener({} as IncomingMessage, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(500);
    expect(res.end).toHaveBeenCalledWith('Internal server error');
    expect(consoleError).toHaveBeenCalledWith('Request handler error:', expect.any(Error));

    consoleError.mockRestore();
  });

  test('a resolving handler leaves the response untouched', async () => {
    const res = makeRes();
    const handle = vi.fn().mockResolvedValue(undefined);

    const listener = createRequestListener(handle);
    listener({} as IncomingMessage, res);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    expect(res.end).not.toHaveBeenCalled();
  });
});

describe('handleServerError()', () => {
  test('logs the error and exits with code 1', () => {
    const exit = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handleServerError(new Error('listen EADDRINUSE'), exit);

    expect(consoleError).toHaveBeenCalledWith('Server error:', expect.any(Error));
    expect(exit).toHaveBeenCalledWith(1);

    consoleError.mockRestore();
  });
});

describe('handlePrepareFailure()', () => {
  test('logs the error and exits with code 1', () => {
    const exit = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handlePrepareFailure(new Error('prepare failed'), exit);

    expect(consoleError).toHaveBeenCalledWith('Failed to prepare Next.js app:', expect.any(Error));
    expect(exit).toHaveBeenCalledWith(1);

    consoleError.mockRestore();
  });
});
