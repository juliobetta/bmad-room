import type { ApiErrorBody, BrowseResult, Message, Persona, Project, Thread } from './types';

export class ApiError extends Error {}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => undefined)) as T | ApiErrorBody | undefined;
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? (body as ApiErrorBody).error
        : `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return body as T;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  return parseJsonOrThrow<Project[]>(res);
}

export async function createProject(path: string): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return parseJsonOrThrow<Project>(res);
}

export async function browse(path?: string | null): Promise<BrowseResult> {
  const search = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`/api/fs/browse${search}`);
  return parseJsonOrThrow<BrowseResult>(res);
}

export async function fetchPersonas(): Promise<Persona[]> {
  const res = await fetch('/api/personas');
  return parseJsonOrThrow<Persona[]>(res);
}

export async function openThread(projectId: string, personaId: string): Promise<Thread> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaId }),
  });
  return parseJsonOrThrow<Thread>(res);
}

/**
 * REST bootstrap for a thread's message history, loaded before its WS
 * connection opens (that connection is opened directly from the
 * component/state layer, not this REST client — see `state/thread-socket.ts`).
 */
export async function fetchMessages(threadId: string, before?: string): Promise<Message[]> {
  const search = before ? `?before=${encodeURIComponent(before)}` : '';
  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages${search}`);
  return parseJsonOrThrow<Message[]>(res);
}
