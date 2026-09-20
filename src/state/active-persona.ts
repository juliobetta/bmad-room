import { useSyncExternalStore } from 'react';
import { getActiveProjectId, subscribeActiveProject } from './active-project';

/**
 * Client-side active-persona selection, mirroring `active-project.ts`'s
 * `useSyncExternalStore` + localStorage pattern. Resets to `null` whenever
 * `activeProjectId` changes (a persona selection never leaks across
 * projects — Epic 1 Context: "Opening the same persona in a different
 * project is a distinct conversation").
 */

const STORAGE_KEY = 'bmad-room.activePersonaId';

type Listener = () => void;

const listeners = new Set<Listener>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) — stays in-memory only.
  }
}

let currentProjectId: string | null = getActiveProjectId();
let activePersonaId: string | null = readStored();

export function getActivePersonaId(): string | null {
  return activePersonaId;
}

export function setActivePersonaId(id: string | null): void {
  if (id === activePersonaId) return;
  activePersonaId = id;
  writeStored(id);
  for (const listener of listeners) listener();
}

export function subscribeActivePersona(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Whenever the active project changes, reset the active persona to null —
// a persona selection never carries over into a different project.
subscribeActiveProject(() => {
  const nextProjectId = getActiveProjectId();
  if (nextProjectId === currentProjectId) return;
  currentProjectId = nextProjectId;
  if (activePersonaId !== null) {
    activePersonaId = null;
    writeStored(null);
    for (const listener of listeners) listener();
  }
});

function getServerActivePersonaId(): string | null {
  // No `window`/localStorage during SSR — active persona is client-side-only
  // state (see module comment), so the server snapshot is always null.
  return null;
}

export function useActivePersonaId(): string | null {
  return useSyncExternalStore(subscribeActivePersona, getActivePersonaId, getServerActivePersonaId);
}
