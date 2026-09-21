import type { ThreadStatus } from '@/persistence/schema';

/**
 * Lightweight `{threadId, status}` broadcast channel (Code Map). No pty is
 * ever spawned from this module — `ThreadActor` publishes a delta whenever
 * it changes a thread's status; any number of `/ws/presence` sockets can
 * subscribe without opening a per-thread connection.
 */

export interface PresenceDelta {
  threadId: string;
  status: ThreadStatus;
}

type Listener = (delta: PresenceDelta) => void;

const listeners = new Set<Listener>();

export function publishPresence(delta: PresenceDelta): void {
  for (const listener of listeners) listener(delta);
}

export function subscribePresence(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
