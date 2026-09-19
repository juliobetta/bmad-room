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

export function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
}
