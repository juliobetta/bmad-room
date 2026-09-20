import type Database from 'better-sqlite3';
import type { PersonaRow } from './schema';

export type Persona = PersonaRow;

export interface SyncedAgent {
  agentSkillId: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  module: string;
}

interface PersonaSqlRow {
  agent_skill_id: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  module: string;
  status: 'active' | 'removed';
  synced_at: string;
}

function toPersona(row: PersonaSqlRow): Persona {
  return {
    agentSkillId: row.agent_skill_id,
    name: row.name,
    title: row.title,
    icon: row.icon,
    description: row.description,
    module: row.module,
    status: row.status,
    syncedAt: row.synced_at,
  };
}

const SELECT_COLUMNS = 'agent_skill_id, name, title, icon, description, module, status, synced_at';

/**
 * `Persona` catalog. Synced once from `_bmad/config.toml`'s `[agents.*]`
 * tables (see `src/lib/personas.ts`). Backs `GET /api/personas`.
 */
export class PersonasRepo {
  constructor(private readonly db: Database.Database) {}

  list(): Persona[] {
    const rows = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM personas ORDER BY name ASC`).all() as PersonaSqlRow[];
    return rows.map(toPersona);
  }

  findById(agentSkillId: string): Persona | undefined {
    const row = this.db.prepare(`SELECT ${SELECT_COLUMNS} FROM personas WHERE agent_skill_id = ?`).get(agentSkillId) as
      | PersonaSqlRow
      | undefined;
    return row ? toPersona(row) : undefined;
  }

  /**
   * Upsert every synced agent as `status='active'`. Never touches rows
   * whose `agentSkillId` isn't present in `agents` — those are handled by
   * `markRemoved`.
   */
  upsertMany(agents: SyncedAgent[]): void {
    const syncedAt = new Date().toISOString();
    const upsert = this.db.prepare(`
      INSERT INTO personas (agent_skill_id, name, title, icon, description, module, status, synced_at)
      VALUES (@agentSkillId, @name, @title, @icon, @description, @module, 'active', @syncedAt)
      ON CONFLICT(agent_skill_id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        icon = excluded.icon,
        description = excluded.description,
        module = excluded.module,
        status = 'active',
        synced_at = excluded.synced_at
    `);
    const runAll = this.db.transaction((rows: SyncedAgent[]) => {
      for (const agent of rows) {
        upsert.run({ ...agent, syncedAt });
      }
    });
    runAll(agents);
  }

  /**
   * Mark any `Persona` row not in `idsStillPresent` as `status='removed'`.
   * Never deletes rows and never re-matches by name — only the exact
   * `agentSkillId` key.
   */
  markRemoved(idsStillPresent: string[]): void {
    // Defensive guard: an empty list must never fall through to an
    // unconditional UPDATE over the whole table.
    if (idsStillPresent.length === 0) return;
    const placeholders = idsStillPresent.map(() => '?').join(', ');
    this.db
      .prepare(`UPDATE personas SET status = 'removed' WHERE agent_skill_id NOT IN (${placeholders})`)
      .run(...idsStillPresent);
  }
}
