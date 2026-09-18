import { useSyncExternalStore } from 'react';

/**
 * Client-side active-project selection. Per ARCHITECTURE-SPINE.md's
 * Boundaries & Constraints: "Active project selection is client-side only
 * — no server-persisted 'current project' row, since there is no
 * auth/session." Persisted to localStorage only so the last-active project
 * is restored on reopen (EXPERIENCE.md Flow 1: "the project he's working
 * in is already the active rail icon from last session").
 */

const STORAGE_KEY = 'bmad-room.activeProjectId';

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

let activeProjectId: string | null = readStored();

export function getActiveProjectId(): string | null {
  return activeProjectId;
}

export function setActiveProjectId(id: string | null): void {
  if (id === activeProjectId) return;
  activeProjectId = id;
  writeStored(id);
  for (const listener of listeners) listener();
}

export function subscribeActiveProject(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveProjectId(): string | null {
  return useSyncExternalStore(subscribeActiveProject, getActiveProjectId);
}
