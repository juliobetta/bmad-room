import http from 'node:http';
import next from 'next';
import { createRequestListener, handlePrepareFailure, handleServerError } from '@/lib/http-server';
import { handleUpgrade } from '@/ws/server';

/**
 * Custom server wiring Next's request handler over a plain `http.Server`
 * (rather than `next start`/route handlers alone), so `ws.WebSocketServer`
 * (Story 1.4) can attach to this same server's `upgrade` event — App
 * Router route handlers can't serve raw WS upgrades.
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

    // Next's own upgrade handler (dev-mode HMR socket, etc.) — only
    // available after prepare() resolves. Anything our own handleUpgrade
    // doesn't recognize as one of our own WS paths gets forwarded here
    // instead of the socket being destroyed, since this is the only
    // 'upgrade' listener on the server and Next never gets its own.
    const nextUpgradeHandler = app.getUpgradeHandler();

    server.on('upgrade', (req, socket, head) => {
      handleUpgrade(req, socket, head, nextUpgradeHandler);
    });

    server.on('error', (err) => handleServerError(err));

    server.listen(PORT, () => {
      console.log(`bmad-room-chat-ui listening on http://localhost:${PORT}`);
    });
  })
  .catch((err: unknown) => handlePrepareFailure(err));
