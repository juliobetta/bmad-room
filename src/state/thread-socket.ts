'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Message, MessageKind, ThreadStatus } from '@/api/types';

/**
 * WS connection lifecycle keyed on `thread?.id` (mirrors the REST-fetch
 * effect already in `src/app/page.tsx`), exposing live status/streaming
 * text/completed messages via `useSyncExternalStore`. REST history loads
 * separately (`fetchMessages`, `src/api/client.ts`) before this connection
 * opens — this module only carries live events for an already-open thread.
 *
 * No reconnect/resume-in-flight-stream handling here (Story 1.9): a
 * remount (thread switch, page reload) opens a fresh socket and relies on
 * the REST history fetch, not this store, to repopulate anything missed.
 */

export interface StreamingMessage {
  speakerPersonaId: string | null;
  content: string;
}

export interface ThreadSocketState {
  status: ThreadStatus | null;
  streaming: StreamingMessage | null;
  liveMessages: Message[];
  connectionError: string | null;
}

const EMPTY_STATE: ThreadSocketState = { status: null, streaming: null, liveMessages: [], connectionError: null };

function wsUrlFor(threadId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/threads/${encodeURIComponent(threadId)}`;
}

export class ThreadSocketStore {
  private state: ThreadSocketState = EMPTY_STATE;
  private readonly listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  // Set before `dispose()` closes the socket on purpose (thread switch,
  // unmount) so the `close` listener below doesn't report a deliberate
  // close as a lost connection.
  private disposed = false;

  constructor(private readonly threadId: string) {
    this.connect();
  }

  getState(): ThreadSocketState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  sendMessage(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ type: 'send-message', threadId: this.threadId, payload: { text }, ts: Date.now() }),
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }

  private setState(patch: Partial<ThreadSocketState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private connect(): void {
    const ws = new WebSocket(wsUrlFor(this.threadId));
    this.ws = ws;

    ws.addEventListener('message', (event) => {
      let frame: unknown;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.handleFrame(frame);
    });

    ws.addEventListener('error', () => {
      this.setState({ connectionError: 'Lost connection to the persona process.' });
    });

    // A dropped connection (server restart, network blip) otherwise leaves
    // `connectionError` unset and the composer silently no-ops on send —
    // surface it the same way an `error` event does, unless this actor
    // closed the socket itself via `dispose()`.
    ws.addEventListener('close', () => {
      if (this.disposed) return;
      this.setState({ connectionError: 'Lost connection to the persona process.' });
    });
  }

  private handleFrame(frame: unknown): void {
    if (typeof frame !== 'object' || frame === null || !('type' in frame)) return;
    const { type, payload } = frame as { type: string; payload: unknown };

    switch (type) {
      case 'status': {
        const status = (payload as { status?: ThreadStatus } | undefined)?.status;
        if (status) this.setState({ status });
        return;
      }
      case 'message.delta': {
        const p = payload as { speakerPersonaId: string | null; content: string };
        this.setState({ streaming: { speakerPersonaId: p.speakerPersonaId, content: p.content } });
        return;
      }
      case 'message.complete': {
        const p = payload as {
          messageId: string;
          speakerPersonaId: string | null;
          kind: MessageKind;
          content: string;
        };
        const message: Message = {
          id: p.messageId,
          threadId: this.threadId,
          speakerPersonaId: p.speakerPersonaId,
          kind: p.kind,
          parentMessageId: null,
          content: p.content,
          createdAt: new Date().toISOString(),
        };
        this.setState({ streaming: null, liveMessages: [...this.state.liveMessages, message] });
        return;
      }
      case 'system': {
        const p = payload as { messageId?: string; content: string };
        const message: Message = {
          id: p.messageId ?? `system-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          threadId: this.threadId,
          speakerPersonaId: null,
          kind: 'system',
          parentMessageId: null,
          content: p.content,
          createdAt: new Date().toISOString(),
        };
        this.setState({ liveMessages: [...this.state.liveMessages, message] });
        return;
      }
      default:
        return;
    }
  }
}

export interface UseThreadSocketResult extends ThreadSocketState {
  sendMessage: (text: string) => void;
}

export function useThreadSocket(threadId: string | null): UseThreadSocketResult {
  // Created synchronously during render (not in a `useEffect`) so it's
  // already live by the time `useSyncExternalStore`'s own subscription
  // runs — creating it in an effect would race that subscription and
  // permanently miss the store's updates on a fresh mount.
  const store = useMemo(() => (threadId ? new ThreadSocketStore(threadId) : null), [threadId]);

  useEffect(() => {
    return () => {
      store?.dispose();
    };
  }, [store]);

  const state = useSyncExternalStore(
    (onStoreChange) => store?.subscribe(onStoreChange) ?? (() => {}),
    () => store?.getState() ?? EMPTY_STATE,
    () => EMPTY_STATE,
  );

  return {
    ...state,
    sendMessage: (text: string) => store?.sendMessage(text),
  };
}
