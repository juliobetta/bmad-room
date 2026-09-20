import path from 'node:path';
import Database from 'better-sqlite3';
import { PersonasRepo } from '@/persistence/personas-repo';
import { ProjectsRepo } from '@/persistence/projects-repo';
import { initSchema } from '@/persistence/schema';
import { ThreadsRepo } from '@/persistence/threads-repo';
import { syncPersonas } from './personas';

/**
 * Module-level `Database` singleton (Code Map: "instantiate the Database
 * singleton once ... instead of in index.ts"). Guarded against Next dev's
 * hot-reload re-import via `globalThis`, mirroring the standard
 * Prisma-style singleton pattern — without it, every route-module
 * re-evaluation during hot reload would open a duplicate connection
 * against the same `bmad-room.db` file (Acceptance Criteria).
 */

declare global {
  // eslint-disable-next-line no-var
  var __bmadRoomDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const dbPath = process.env.BMAD_ROOM_DB_PATH ?? path.join(process.cwd(), 'bmad-room.db');
  const db = new Database(dbPath);
  initSchema(db);
  return db;
}

export const db: Database.Database = globalThis.__bmadRoomDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__bmadRoomDb = db;
}

export const projectsRepo = new ProjectsRepo(db);
export const personasRepo = new PersonasRepo(db);
export const threadsRepo = new ThreadsRepo(db);

// Sync the persona catalog from _bmad/config.toml once at module load,
// mirroring this module's own singleton-on-import pattern (Code Map:
// "call a new syncPersonas(personasRepo) once after initSchema(db)").
syncPersonas(personasRepo);
