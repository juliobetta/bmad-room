import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Coverage for `ThreadSocketStore.handleFrame` (message.delta/complete,
 * system, status) and the connection-lifecycle listeners (`error`/`close`),
 * with `WebSocket`/`window` stubbed so no real socket is opened.
 */

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private readonly listeners: Record<string, Array<(event: { data?: string }) => void>> = {};

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, cb: (event: { data?: string }) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  emit(event: string, payload: { data?: string }): void {
    for (const cb of this.listeners[event] ?? []) cb(payload);
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:4317' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function latestSocket(): FakeWebSocket {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error('no FakeWebSocket was constructed');
  return ws;
}

describe('ThreadSocketStore', () => {
  test('connects to /ws/threads/:id scoped to the given thread', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    new ThreadSocketStore('thread-1');
    expect(latestSocket().url).toBe('ws://localhost:4317/ws/threads/thread-1');
  });

  test('message.delta sets streaming', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    latestSocket().emit('message', {
      data: JSON.stringify({
        type: 'message.delta',
        threadId: 'thread-1',
        payload: { speakerPersonaId: 'bmad-agent-analyst', content: 'Hi' },
        ts: 1,
      }),
    });

    expect(store.getState().streaming).toEqual({ speakerPersonaId: 'bmad-agent-analyst', content: 'Hi' });
  });

  test('message.complete clears streaming and appends to liveMessages', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    const ws = latestSocket();

    ws.emit('message', {
      data: JSON.stringify({
        type: 'message.delta',
        threadId: 'thread-1',
        payload: { speakerPersonaId: 'bmad-agent-analyst', content: 'Hi' },
        ts: 1,
      }),
    });
    ws.emit('message', {
      data: JSON.stringify({
        type: 'message.complete',
        threadId: 'thread-1',
        payload: { messageId: 'm1', speakerPersonaId: 'bmad-agent-analyst', kind: 'text', content: 'Hi there' },
        ts: 2,
      }),
    });

    const state = store.getState();
    expect(state.streaming).toBeNull();
    expect(state.liveMessages).toHaveLength(1);
    expect(state.liveMessages[0]).toMatchObject({
      id: 'm1',
      speakerPersonaId: 'bmad-agent-analyst',
      kind: 'text',
      content: 'Hi there',
    });
  });

  test('system frame appends a system-kind message to liveMessages', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    latestSocket().emit('message', {
      data: JSON.stringify({
        type: 'system',
        threadId: 'thread-1',
        payload: { messageId: 's1', content: 'Activation failed' },
        ts: 1,
      }),
    });

    const state = store.getState();
    expect(state.liveMessages).toHaveLength(1);
    expect(state.liveMessages[0]).toMatchObject({ id: 's1', kind: 'system', content: 'Activation failed' });
  });

  test('status frame updates status', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    latestSocket().emit('message', {
      data: JSON.stringify({ type: 'status', threadId: 'thread-1', payload: { status: 'working' }, ts: 1 }),
    });

    expect(store.getState().status).toBe('working');
  });

  test('an unexpected close sets connectionError', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    latestSocket().emit('close', {});

    expect(store.getState().connectionError).toBeTruthy();
  });

  test('dispose() closing the socket itself does not set connectionError', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    store.dispose();

    expect(store.getState().connectionError).toBeNull();
  });

  test('sendMessage() sends a send-message frame while the socket is open', async () => {
    const { ThreadSocketStore } = await import('./thread-socket');
    const store = new ThreadSocketStore('thread-1');
    store.sendMessage('hello');

    const sent = JSON.parse(latestSocket().sent[0] as string);
    expect(sent).toMatchObject({ type: 'send-message', threadId: 'thread-1', payload: { text: 'hello' } });
  });
});
