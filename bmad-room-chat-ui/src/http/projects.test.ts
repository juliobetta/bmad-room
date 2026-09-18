import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { AddressInfo } from 'node:net';
import { initSchema } from '../persistence/schema.js';
import { ProjectsRepo } from '../persistence/projectsRepo.js';
import { createProject, listProjects, validateProjectCheckout } from './projects.js';
import { createServer } from './server.js';

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

test('validateProjectCheckout() rejects a relative path', async () => {
  const result = await validateProjectCheckout('relative/path');
  assert.equal(result.ok, false);
});

test('validateProjectCheckout() rejects a directory without .git', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-nogit-'));
  const result = await validateProjectCheckout(root);
  assert.equal(result.ok, false);
});

test('validateProjectCheckout() accepts a writable directory containing .git', async () => {
  const root = await makeValidCheckout();
  const result = await validateProjectCheckout(root);
  assert.equal(result.ok, true);
});

test('validateProjectCheckout() rejects a non-writable directory containing .git', { skip: process.getuid?.() === 0 }, async () => {
  const root = await makeValidCheckout();
  await fs.chmod(root, 0o555);
  try {
    const result = await validateProjectCheckout(root);
    assert.equal(result.ok, false);
  } finally {
    await fs.chmod(root, 0o755);
  }
});

test('createProject() creates a Project row for a valid checkout (201)', async () => {
  const repo = makeRepo();
  const root = await makeValidCheckout();

  const result = await createProject(repo, { path: root });
  assert.equal(result.status, 201);
  assert.equal(listProjects(repo).length, 1);
});

test('createProject() creates no row for an invalid checkout (422)', async () => {
  const repo = makeRepo();
  const notAGitRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-invalid-'));

  const result = await createProject(repo, { path: notAGitRepo });
  assert.equal(result.status, 422);
  assert.equal(listProjects(repo).length, 0);
});

test('createProject() rejects a missing path with 422', async () => {
  const repo = makeRepo();
  const result = await createProject(repo, {});
  assert.equal(result.status, 422);
});

test('createProject() rejects re-adding the same path with 422', async () => {
  const repo = makeRepo();
  const root = await makeValidCheckout();

  const first = await createProject(repo, { path: root });
  assert.equal(first.status, 201);

  const second = await createProject(repo, { path: root });
  assert.equal(second.status, 422);
  assert.equal(listProjects(repo).length, 1);
});

test('HTTP routes: GET/POST /api/projects and GET /api/fs/browse', async () => {
  const repo = makeRepo();
  const server = createServer(repo);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const emptyList = await fetch(`${base}/api/projects`);
    assert.equal(emptyList.status, 200);
    assert.deepEqual(await emptyList.json(), []);

    const root = await makeValidCheckout();
    const created = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: root }),
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as { id: string; path: string };
    assert.equal(createdBody.path, await fs.realpath(root));

    const listAfterCreate = await fetch(`${base}/api/projects`);
    const projects = (await listAfterCreate.json()) as unknown[];
    assert.equal(projects.length, 1);

    const invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-room-http-invalid-'));
    const rejected = await fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: invalidRoot }),
    });
    assert.equal(rejected.status, 422);

    const browse = await fetch(`${base}/api/fs/browse?path=${encodeURIComponent(os.tmpdir())}`);
    assert.equal(browse.status, 200);

    const browseMissing = await fetch(`${base}/api/fs/browse?path=${encodeURIComponent('/no/such/path')}`);
    assert.equal(browseMissing.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
