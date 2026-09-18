import type { ApiErrorBody, BrowseResult, Project } from './types';

export class ApiError extends Error {}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => undefined)) as T | ApiErrorBody | undefined;
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body ? (body as ApiErrorBody).error : `Request failed (${res.status})`;
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
