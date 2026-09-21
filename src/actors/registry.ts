import { ThreadActor } from './ThreadActor';

/**
 * `threadId -> ThreadActor` map (Code Map). Create-if-absent on the first
 * `send-message`, actor-initiated deregistration only — this module never
 * kills a pty or reaches into actor state directly (Boundaries & Constraints).
 */

const actors = new Map<string, ThreadActor>();

export function getOrCreateThreadActor(threadId: string): ThreadActor {
  const existing = actors.get(threadId);
  if (existing) return existing;

  const actor = new ThreadActor(threadId, () => {
    // Actor-initiated only: called from inside ThreadActor itself when it
    // decides to deregister (crash, idle-reap).
    if (actors.get(threadId) === actor) actors.delete(threadId);
  });
  actors.set(threadId, actor);
  return actor;
}

export function getThreadActor(threadId: string): ThreadActor | undefined {
  return actors.get(threadId);
}

/** Test-only escape hatch to reset actor state between spec files. */
export function __resetRegistryForTests(): void {
  actors.clear();
}
