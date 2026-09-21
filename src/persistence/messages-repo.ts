import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { MessageKind, MessageRow } from './schema';

export type Message = MessageRow;

interface MessageSqlRow {
  id: string;
  thread_id: string;
  speaker_persona_id: string | null;
  kind: MessageKind;
  parent_message_id: string | null;
  content: string;
  created_at: string;
}

function toMessage(row: MessageSqlRow): Message {
  return {
    id: row.id,
    threadId: row.thread_id,
    speakerPersonaId: row.speaker_persona_id,
    kind: row.kind,
    parentMessageId: row.parent_message_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, thread_id, speaker_persona_id, kind, parent_message_id, content, created_at';

export interface ListByThreadOptions {
  before?: string;
  limit?: number;
}

const DEFAULT_LIST_LIMIT = 50;

/**
 * `Message` rows. Backs `GET /api/threads/[id]/messages` and every
 * `ThreadActor` turn-persistence write (`kind='text'`/`'system'` for this
 * story; `'tool-card'`/`'subagent-card'` are schema-ready for Story 1.5).
 * Copies `ThreadsRepo`'s class/mapper/`SELECT_COLUMNS` pattern.
 */
export class MessagesRepo {
  constructor(private readonly db: Database.Database) {}

  create(
    threadId: string,
    kind: MessageKind,
    content: string,
    speakerPersonaId?: string | null,
    parentMessageId?: string | null,
  ): Message {
    const message: Message = {
      id: nanoid(),
      threadId,
      speakerPersonaId: speakerPersonaId ?? null,
      kind,
      parentMessageId: parentMessageId ?? null,
      content,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        'INSERT INTO messages (id, thread_id, speaker_persona_id, kind, parent_message_id, content, created_at) ' +
          'VALUES (@id, @threadId, @speakerPersonaId, @kind, @parentMessageId, @content, @createdAt)',
      )
      .run(message);
    return message;
  }

  /**
   * Newest-page-first pagination: `before` (a message id) returns the
   * `limit` messages immediately preceding it by `created_at`; omitted,
   * returns the newest `limit` messages. Callers reverse the page to
   * chronological order for display, mirroring the "no cursor-token
   * abstraction needed for a single-user local SQLite store" convention.
   */
  listByThread(threadId: string, options: ListByThreadOptions = {}): Message[] {
    const limit = options.limit ?? DEFAULT_LIST_LIMIT;

    // Ordered by rowid (insertion order) rather than created_at alone:
    // two messages created in the same millisecond would otherwise tie,
    // making ORDER BY created_at non-deterministic for pagination.
    if (options.before) {
      const anchor = this.db.prepare('SELECT rowid FROM messages WHERE id = ?').get(options.before) as
        | { rowid: number }
        | undefined;
      if (!anchor) return [];
      const rows = this.db
        .prepare(`SELECT ${SELECT_COLUMNS} FROM messages WHERE thread_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT ?`)
        .all(threadId, anchor.rowid, limit) as MessageSqlRow[];
      return rows.map(toMessage);
    }

    const rows = this.db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM messages WHERE thread_id = ? ORDER BY rowid DESC LIMIT ?`)
      .all(threadId, limit) as MessageSqlRow[];
    return rows.map(toMessage);
  }
}
