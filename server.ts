import http from 'node:http';
import next from 'next';

/**
 * Custom server wiring Next's request handler over a plain `http.Server`
 * (rather than `next start`/route handlers alone), so that a future
 * `ws.WebSocketServer` (Story 1.3+) can attach to this same server's
 * `upgrade` event — App Router route handlers can't serve raw WS upgrades.
 *
 * Still reads `PORT` (unchanged from the old standalone backend) and
 * `BMAD_ROOM_DB_PATH` (consumed by src/lib/db.ts, not this file) env vars.
 */

const PORT = Number(process.env.PORT ?? 4317);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((err: unknown) => {
        console.error('Request handler error:', err);
        res.statusCode = 500;
        res.end('Internal server error');
      });
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });

    server.listen(PORT, () => {
      console.log(`bmad-room-chat-ui listening on http://localhost:${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error('Failed to prepare Next.js app:', err);
    process.exit(1);
  });
