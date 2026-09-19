import type { Stats } from 'node:fs';
import { promises as fs, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import type { Project, ProjectsRepo } from '@/persistence/projects-repo';

/**
 * `GET /api/projects`, `POST /api/projects` with checkout validation.
 *
 * A directory is a valid "real project checkout" only if it contains a
 * `.git` directory AND is writable. Per AD-7, the path is never trusted
 * verbatim: it is independently re-resolved/validated on the filesystem
 * here, regardless of how the client obtained it.
 */

export type CheckoutValidation = { ok: true; resolvedPath: string } | { ok: false; reason: string };

export async function validateProjectCheckout(rawPath: string): Promise<CheckoutValidation> {
  if (!path.isAbsolute(rawPath)) {
    return { ok: false, reason: 'Path must be an absolute path' };
  }

  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(rawPath);
  } catch {
    return { ok: false, reason: `Path does not exist: ${rawPath}` };
  }

  let stat: Stats;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    return { ok: false, reason: `Path does not exist: ${resolvedPath}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, reason: 'Path is not a directory' };
  }

  const gitPath = path.join(resolvedPath, '.git');
  try {
    const gitStat = await fs.stat(gitPath);
    if (!gitStat.isDirectory()) {
      return { ok: false, reason: 'Not a real project checkout (no .git directory)' };
    }
  } catch {
    return { ok: false, reason: 'Not a real project checkout (no .git directory)' };
  }

  try {
    await fs.access(resolvedPath, fsConstants.W_OK);
  } catch {
    return { ok: false, reason: 'Directory is not writable' };
  }

  return { ok: true, resolvedPath };
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message.includes('UNIQUE constraint failed');
}

export type CreateProjectResult = { status: 201; body: Project } | { status: 422; body: { error: string } };

export async function createProject(repo: ProjectsRepo, rawBody: unknown): Promise<CreateProjectResult> {
  const rawPath =
    typeof rawBody === 'object' && rawBody !== null && 'path' in rawBody
      ? (rawBody as { path: unknown }).path
      : undefined;

  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { status: 422, body: { error: 'path is required' } };
  }

  const validation = await validateProjectCheckout(rawPath);
  if (!validation.ok) {
    return { status: 422, body: { error: validation.reason } };
  }

  const existing = repo.findByPath(validation.resolvedPath);
  if (existing) {
    return { status: 422, body: { error: 'This project has already been added' } };
  }

  try {
    const project = repo.create(validation.resolvedPath);
    return { status: 201, body: project };
  } catch (err) {
    // TOCTOU: a concurrent request may have inserted the same path between
    // the findByPath check above and this insert. Treat the resulting
    // UNIQUE constraint violation the same as the pre-check duplicate.
    if (isUniqueConstraintError(err)) {
      return { status: 422, body: { error: 'This project has already been added' } };
    }
    throw err;
  }
}

export function listProjects(repo: ProjectsRepo): Project[] {
  return repo.list();
}
