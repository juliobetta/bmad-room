import type Database from 'better-sqlite3';

/**
 * `Project` entity per ARCHITECTURE-SPINE.md Consistency Conventions:
 * id = nanoid string, createdAt = ISO-8601 UTC.
 * Table name is snake_case plural (`projects`); columns snake_case,
 * mapped to camelCase TS fields by the repository layer.
 */
export interface ProjectRow {
  id: string;
  path: string;
  createdAt: string;
}

/**
 * `Persona` entity (Epic 1 Context: "global catalog, synced once from
 * BMad's agent config, keyed by stable `agentSkillId` — never duplicated
 * per project"). `agentSkillId` is the `_bmad/config.toml` `[agents.*]`
 * TOML key (e.g. `bmad-agent-analyst`), never the display `name`.
 */
export interface PersonaRow {
  agentSkillId: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  module: string;
  status: 'active' | 'removed';
  syncedAt: string;
}

/**
 * `Thread` entity. `kind='dm'` rows are unique per `(projectId, personaId)`
 * via a partial unique index, so future `kind='channel'` rows (no
 * `personaId`) are unaffected.
 */
export interface ThreadRow {
  id: string;
  projectId: string;
  personaId: string | null;
  kind: 'dm' | 'channel';
  status: string;
  createdAt: string;
}

export function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personas (
      agent_skill_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      description TEXT NOT NULL,
      module TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'removed')),
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      persona_id TEXT REFERENCES personas(agent_skill_id),
      kind TEXT NOT NULL CHECK (kind IN ('dm', 'channel')),
      status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS threads_project_persona_dm_unique
      ON threads(project_id, persona_id)
      WHERE kind = 'dm';
  `);
}
