import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WebSocket } from 'ws';

/**
 * Coverage for the `send-message` WS dispatch path in `attachThreadSocket`.
 * `@/actors/registry` and `@/lib/db` are mocked so this exercises only the
 * frame-parsing/dispatch logic in `src/ws/server.ts`, not a real
 * `ThreadActor` or database.
 */

const sendMessage = vi.fn().mockResolvedValue(undefined);
const subscribe = vi.fn(() => () => {});
const getOrCreateThreadActor = vi.fn(() => ({ subscribe, sendMessage }));

vi.mock('@/actors/registry', () => ({
  getOrCreateThreadActor,
}));

const findById = vi.fn((): { id: string } | undefined => ({ id: 'thread-1' }));
vi.mock('@/lib/db', () => ({
  threadsRepo: { findById },
}));

class FakeWebSocket {
  readyState = 1; // ws.WebSocket.OPEN
  sent: string[] = [];
  closed = false;
  private readonly listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  on(event: string, cb: (...args: unknown[]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }

  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners[event] ?? []) cb(...args);
  }
}

describe('ws/server attachThreadSocket', () => {
  beforeEach(() => {
    sendMessage.mockClear();
    subscribe.mockClear();
    getOrCreateThreadActor.mockClear();
    findById.mockClear();
    findById.mockReturnValue({ id: 'thread-1' });
  });

  test('dispatches a send-message frame to the actor with the parsed text', async () => {
    const { attachThreadSocket } = await import('./server');
    const ws = new FakeWebSocket();

    attachThreadSocket(ws as unknown as WebSocket, 'thread-1');
    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'send-message', threadId: 'thread-1', payload: { text: 'hello' }, ts: 1 })),
    );

    expect(sendMessage).toHaveBeenCalledWith('hello');
  });

  test('ignores a malformed JSON frame without throwing', async () => {
    const { attachThreadSocket } = await import('./server');
    const ws = new FakeWebSocket();

    attachThreadSocket(ws as unknown as WebSocket, 'thread-1');
    expect(() => ws.emit('message', Buffer.from('{not valid json'))).not.toThrow();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('ignores a send-message frame with no text payload', async () => {
    const { attachThreadSocket } = await import('./server');
    const ws = new FakeWebSocket();

    attachThreadSocket(ws as unknown as WebSocket, 'thread-1');
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'send-message', threadId: 'thread-1', payload: {}, ts: 1 })));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('for an unknown thread, sends one system frame and closes instead of attaching an actor', async () => {
    findById.mockReturnValue(undefined);
    const { attachThreadSocket } = await import('./server');
    const ws = new FakeWebSocket();

    attachThreadSocket(ws as unknown as WebSocket, 'does-not-exist');

    expect(getOrCreateThreadActor).not.toHaveBeenCalled();
    expect(ws.closed).toBe(true);
    expect(ws.sent).toHaveLength(1);
    const frame = JSON.parse(ws.sent[0] as string);
    expect(frame.type).toBe('system');
    expect(frame.threadId).toBe('does-not-exist');
  });

  test('unsubscribes from the actor when the socket closes', async () => {
    const unsubscribe = vi.fn();
    subscribe.mockReturnValueOnce(unsubscribe);
    const { attachThreadSocket } = await import('./server');
    const ws = new FakeWebSocket();

    attachThreadSocket(ws as unknown as WebSocket, 'thread-1');
    ws.emit('close');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
