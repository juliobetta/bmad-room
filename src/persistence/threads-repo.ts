import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { ThreadRow, ThreadStatus } from './schema';
import { isUniqueConstraintError } from './sqlite-errors';

export type Thread = ThreadRow;

interface ThreadSqlRow {
  id: string;
  project_id: string;
  persona_id: string | null;
  kind: 'dm' | 'channel';
  status: ThreadStatus;
  created_at: string;
}

function toThread(row: ThreadSqlRow): Thread {
  return {
    id: row.id,
    projectId: row.project_id,
    personaId: row.persona_id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, project_id, persona_id, kind, status, created_at';

/**
 * `Thread` rows. Backs `GET /api/projects/[id]/threads` and
 * `POST /api/projects/[id]/threads`.
 */
export class ThreadsRepo {
  constructor(private readonly db: Database.Database) {}

  listByProject(projectId: string): Thread[] {
    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM threads WHERE project_id = ? ORDER BY created_at ASC`)
      .all(projectId) as ThreadSqlRow[];
    return rows.map(toThread);
  }

  findById(id: string): Thread | undefined {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM threads WHERE id = ?`).get(id) as
      | ThreadSqlRow
      | undefined;
    return row ? toThread(row) : undefined;
  }

  /** Persists a `Thread.status` transition — the actor's own lifecycle drives every call. */
  updateStatus(id: string, status: ThreadStatus): void {
    this.db.prepare('UPDATE threads SET status = ? WHERE id = ?').run(status, id);
  }

  findDm(projectId: string, personaId: string): Thread | undefined {
    const row = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM threads WHERE project_id = ? AND persona_id = ? AND kind = 'dm'`)
      .get(projectId, personaId) as ThreadSqlRow | undefined;
    return row ? toThread(row) : undefined;
  }

  /**
   * Select-then-insert, same TOCTOU-tolerant pattern as
   * `src/lib/projects.ts`'s `createProject`: the partial unique index on
   * `(project_id, persona_id) WHERE kind='dm'` is the source of truth, this
   * is just an optimistic pre-check to avoid the round trip on the common
   * path. Callers must catch the UNIQUE constraint error and retry with
   * `findDm` on the rare concurrent-create race.
   */
  findOrCreateDm(projectId: string, personaId: string): Thread {
    const existing = this.findDm(projectId, personaId);
    if (existing) return existing;

    const thread: Thread = {
      id: nanoid(),
      projectId,
      personaId,
      kind: 'dm',
      status: 'idle',
      createdAt: new Date().toISOString(),
    };
    try {
      this.db
        .prepare(
          'INSERT INTO threads (id, project_id, persona_id, kind, status, created_at) VALUES (@id, @projectId, @personaId, @kind, @status, @createdAt)',
        )
        .run(thread);
      return thread;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const raced = this.findDm(projectId, personaId);
        if (raced) return raced;
      }
      throw err;
    }
  }
}
