import http from 'node:http';
import next from 'next';
import { createRequestListener, handlePrepareFailure, handleServerError } from '@/lib/http-server';

/**
 * Custom server wiring Next's request handler over a plain `http.Server`
 * (rather than `next start`/route handlers alone), so that a future
 * `ws.WebSocketServer` (Story 1.3+) can attach to this same server's
 * `upgrade` event — App Router route handlers can't serve raw WS upgrades.
 *
 * Still reads `PORT` (unchanged from the old standalone backend) and
 * `BMAD_ROOM_DB_PATH` (consumed by src/lib/db.ts, not this file) env vars.
 *
 * The error-handling callbacks below are thin wrappers around
 * `src/lib/http-server.ts`, which is unit-tested — this file itself runs
 * top-level side effects on import and can't be exercised directly.
 */

const PORT = Number(process.env.PORT ?? 4317);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer(createRequestListener(handle));

    server.on('error', (err) => handleServerError(err));

    server.listen(PORT, () => {
      console.log(`bmad-room-chat-ui listening on http://localhost:${PORT}`);
    });
  })
  .catch((err: unknown) => handlePrepareFailure(err));
