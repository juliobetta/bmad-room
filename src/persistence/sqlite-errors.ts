/**
 * Shared `better-sqlite3` error classification, used by any repo/service
 * doing a select-then-insert TOCTOU-tolerant create (see `ProjectsRepo`'s
 * `createProject` and `ThreadsRepo.findOrCreateDm`).
 */
export function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message.includes('UNIQUE constraint failed');
}
