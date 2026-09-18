import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';
import type { ProjectRow } from './schema.js';

export type Project = ProjectRow;

interface ProjectSqlRow {
  id: string;
  path: string;
  created_at: string;
}

function toProject(row: ProjectSqlRow): Project {
  return { id: row.id, path: row.path, createdAt: row.created_at };
}

/**
 * Create/list `Project` rows. Backs `GET /api/projects` and `POST /api/projects`.
 */
export class ProjectsRepo {
  constructor(private readonly db: Database.Database) {}

  list(): Project[] {
    const rows = this.db
      .prepare('SELECT id, path, created_at FROM projects ORDER BY created_at ASC')
      .all() as ProjectSqlRow[];
    return rows.map(toProject);
  }

  findByPath(path: string): Project | undefined {
    const row = this.db
      .prepare('SELECT id, path, created_at FROM projects WHERE path = ?')
      .get(path) as ProjectSqlRow | undefined;
    return row ? toProject(row) : undefined;
  }

  create(path: string): Project {
    const project: Project = {
      id: nanoid(),
      path,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO projects (id, path, created_at) VALUES (@id, @path, @createdAt)')
      .run(project);
    return project;
  }
}
