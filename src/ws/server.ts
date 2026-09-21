import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { getOrCreateThreadActor } from '@/actors/registry';
import { threadsRepo } from '@/lib/db';
import { subscribePresence } from './presence';
import type { WsCommand, WsEvent } from './types';

/**
 * WS connection handling (Code Map): parses `{ type, threadId, payload, ts }`
 * frames, dispatches `send-message` commands to the right `ThreadActor` via
 * the registry, and forwards actor-emitted events to subscribed sockets.
 * Routes by URL path — `/ws/threads/:threadId` vs. the shared
 * `/ws/presence` channel — via `handleUpgrade`, called from `server.ts`'s
 * `http.Server` `upgrade` event (the only place that event can be wired).
 */

const THREAD_PATH_PATTERN = /^\/ws\/threads\/([^/]+)\/?$/;
const PRESENCE_PATH = '/ws/presence';

const threadWss = new WebSocketServer({ noServer: true });
const presenceWss = new WebSocketServer({ noServer: true });

function send(ws: WebSocket, event: WsEvent): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(event));
}

export function attachThreadSocket(ws: WebSocket, threadId: string): void {
  if (!threadsRepo.findById(threadId)) {
    // The registry would otherwise create-if-absent an actor for a
    // threadId that doesn't exist in the DB; `sendMessage()` would then
    // throw with nothing but a server-side `console.error` — tell the
    // client and close instead of leaving the socket hanging silently.
    send(ws, { type: 'system', threadId, payload: { content: `Unknown thread: ${threadId}` }, ts: Date.now() });
    ws.close();
    return;
  }

  const actor = getOrCreateThreadActor(threadId);
  const unsubscribe = actor.subscribe((event) => send(ws, event));

  ws.on('message', (raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return; // malformed frame — ignore rather than crash the socket
    }
    if (typeof parsed !== 'object' || parsed === null) return;

    const command = parsed as Partial<WsCommand>;
    if (command.type === 'send-message') {
      const payload = command.payload as { text?: unknown } | undefined;
      const text = typeof payload?.text === 'string' ? payload.text : undefined;
      if (text && text.trim().length > 0) {
        actor.sendMessage(text).catch((err: unknown) => {
          console.error(`ThreadActor.sendMessage failed for thread ${threadId}:`, err);
        });
      }
      return;
    }
    // 'stop-turn' / 'open-in-terminal': names reserved by the wider command
    // vocabulary but no handler exists yet (Stories 1.6/1.10) — ignored.
  });

  ws.on('close', () => {
    unsubscribe();
  });
}

function attachPresenceSocket(ws: WebSocket): void {
  const unsubscribe = subscribePresence((delta) => {
    send(ws, { type: 'status', threadId: delta.threadId, payload: { status: delta.status }, ts: Date.now() });
  });

  ws.on('close', () => {
    unsubscribe();
  });
}

/**
 * Routes a raw HTTP `upgrade` event to the thread channel or the presence
 * channel by `req.url`. Any other path destroys the socket rather than
 * leaving it half-upgraded.
 */
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const rawUrl = req.url ?? '';
  const pathname = rawUrl.split('?')[0] ?? '';

  const threadMatch = pathname.match(THREAD_PATH_PATTERN);
  const threadIdSegment = threadMatch?.[1];
  if (threadIdSegment) {
    let threadId: string;
    try {
      threadId = decodeURIComponent(threadIdSegment);
    } catch {
      // Malformed percent-encoding — this listener runs directly on the
      // raw http `upgrade` event, so an uncaught `URIError` here would
      // crash the whole process.
      socket.destroy();
      return;
    }
    threadWss.handleUpgrade(req, socket, head, (ws) => {
      threadWss.emit('connection', ws, req);
      attachThreadSocket(ws, threadId);
    });
    return;
  }

  if (pathname === PRESENCE_PATH) {
    presenceWss.handleUpgrade(req, socket, head, (ws) => {
      presenceWss.emit('connection', ws, req);
      attachPresenceSocket(ws);
    });
    return;
  }

  socket.destroy();
}
