import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Wraps a Next.js request handler so a rejected promise becomes a logged
 * 500 instead of an unhandled rejection. Extracted from `server.ts` so its
 * error path is unit-testable (`server.ts` itself runs top-level side
 * effects on import and can't be exercised directly by Vitest).
 */
export function createRequestListener(
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error('Request handler error:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    });
  };
}

/** Logs a fatal `http.Server` error and exits. */
export function handleServerError(err: unknown, exit: (code: number) => void = process.exit): void {
  console.error('Server error:', err);
  exit(1);
}

/** Logs a fatal Next.js `prepare()` failure and exits. */
export function handlePrepareFailure(err: unknown, exit: (code: number) => void = process.exit): void {
  console.error('Failed to prepare Next.js app:', err);
  exit(1);
}
