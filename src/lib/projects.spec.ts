import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ProjectsRepo } from '@/persistence/projects-repo';
import { initSchema } from '@/persistence/schema';
import { createProject, listProjects, validateProjectCheckout } from './projects';

function makeRepo(): ProjectsRepo {
  const db = new Database(':memory:');
  initSchema(db);
  return new ProjectsRepo(db);
}

async function makeValidCheckout(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-checkout-'));
  await fs.mkdir(path.join(root, '.git'));
  return root;
}

describe('validateProjectCheckout()', () => {
  test('rejects a relative path', async () => {
    const result = await validateProjectCheckout('relative/path');
    expect(result.ok).toBe(false);
  });

  test('rejects a directory without .git', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-nogit-'));
    const result = await validateProjectCheckout(root);
    expect(result.ok).toBe(false);
  });

  test('accepts a writable directory containing .git', async () => {
    const root = await makeValidCheckout();
    const result = await validateProjectCheckout(root);
    expect(result.ok).toBe(true);
  });

  test.skipIf(process.getuid?.() === 0)('rejects a non-writable directory containing .git', async () => {
    const root = await makeValidCheckout();
    await fs.chmod(root, 0o555);
    try {
      const result = await validateProjectCheckout(root);
      expect(result.ok).toBe(false);
    } finally {
      await fs.chmod(root, 0o755);
    }
  });
});

describe('createProject()', () => {
  test('creates a Project row for a valid checkout (201)', async () => {
    const repo = makeRepo();
    const root = await makeValidCheckout();

    const result = await createProject(repo, { path: root });
    expect(result.status).toBe(201);
    expect(listProjects(repo).length).toBe(1);
  });

  test('creates no row for an invalid checkout (422)', async () => {
    const repo = makeRepo();
    const notAGitRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-invalid-'));

    const result = await createProject(repo, { path: notAGitRepo });
    expect(result.status).toBe(422);
    expect(listProjects(repo).length).toBe(0);
  });

  test('rejects a missing path with 422', async () => {
    const repo = makeRepo();
    const result = await createProject(repo, {});
    expect(result.status).toBe(422);
  });

  test('rejects re-adding the same path with 422', async () => {
    const repo = makeRepo();
    const root = await makeValidCheckout();

    const first = await createProject(repo, { path: root });
    expect(first.status).toBe(201);

    const second = await createProject(repo, { path: root });
    expect(second.status).toBe(422);
    expect(listProjects(repo).length).toBe(1);
  });
});

/**
 * HTTP-route coverage. Route handlers pull their repo from the module-level
 * `src/lib/db.ts` singleton, which also caches itself on `globalThis` outside
 * production (Next dev hot-reload guard). `vi.resetModules()` alone does not
 * clear that `globalThis` cache, so each test resets both it and the module
 * registry, and points `BMAD_ROOM_DB_PATH` at a fresh in-memory database
 * before dynamically importing the route modules — equivalent isolation to
 * the pre-migration per-test `createServer(repo)` instance.
 */
describe('HTTP routes: GET/POST /api/projects and GET /api/fs/browse', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.__bmadRoomDb = undefined;
    process.env.BMAD_ROOM_DB_PATH = ':memory:';
  });

  afterEach(() => {
    delete process.env.BMAD_ROOM_DB_PATH;
  });

  test('projects and fs/browse route handlers behave like the old REST layer', async () => {
    const projectsRoute = await import('@/app/api/projects/route');
    const fsBrowseRoute = await import('@/app/api/fs/browse/route');

    const emptyList = await projectsRoute.GET();
    expect(emptyList.status).toBe(200);
    expect(await emptyList.json()).toEqual([]);
    // Same-origin default (no manual CORS layer, unlike the pre-migration backend):
    // no Access-Control-Allow-Origin header is ever sent.
    expect(emptyList.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const root = await makeValidCheckout();
    const created = await projectsRoute.POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: root }),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string; path: string };
    expect(createdBody.path).toBe(await fs.realpath(root));

    const listAfterCreate = await projectsRoute.GET();
    const projects = (await listAfterCreate.json()) as unknown[];
    expect(projects.length).toBe(1);

    const invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-http-invalid-'));
    const rejected = await projectsRoute.POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: invalidRoot }),
      }),
    );
    expect(rejected.status).toBe(422);

    const browse = await fsBrowseRoute.GET(
      new Request(`http://localhost/api/fs/browse?path=${encodeURIComponent(os.tmpdir())}`),
    );
    expect(browse.status).toBe(200);

    const browseMissing = await fsBrowseRoute.GET(
      new Request(`http://localhost/api/fs/browse?path=${encodeURIComponent('/no/such/path')}`),
    );
    expect(browseMissing.status).toBe(400);
  });

  test('POST /api/projects with malformed JSON returns 400', async () => {
    const projectsRoute = await import('@/app/api/projects/route');
    const malformed = await projectsRoute.POST(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      }),
    );
    expect(malformed.status).toBe(400);
  });

  test('POST /api/projects with an empty body returns 422 (missing path), not 400', async () => {
    const projectsRoute = await import('@/app/api/projects/route');
    const empty = await projectsRoute.POST(new Request('http://localhost/api/projects', { method: 'POST' }));
    expect(empty.status).toBe(422);
  });
});
