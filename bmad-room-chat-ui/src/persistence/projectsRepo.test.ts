import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from './schema.js';
import { ProjectsRepo } from './projectsRepo.js';

function makeRepo(): ProjectsRepo {
  const db = new Database(':memory:');
  initSchema(db);
  return new ProjectsRepo(db);
}

test('list() returns an empty array when no projects exist', () => {
  const repo = makeRepo();
  assert.deepEqual(repo.list(), []);
});

test('create() persists a Project row with nanoid id and ISO-8601 createdAt', () => {
  const repo = makeRepo();
  const project = repo.create('/Users/example/repo');

  assert.equal(typeof project.id, 'string');
  assert.ok(project.id.length > 0);
  assert.equal(project.path, '/Users/example/repo');
  assert.ok(!Number.isNaN(Date.parse(project.createdAt)));

  const listed = repo.list();
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], project);
});

test('findByPath() finds an existing project by exact path', () => {
  const repo = makeRepo();
  repo.create('/Users/example/repo-a');
  const created = repo.create('/Users/example/repo-b');

  const found = repo.findByPath('/Users/example/repo-b');
  assert.deepEqual(found, created);

  const notFound = repo.findByPath('/Users/example/does-not-exist');
  assert.equal(notFound, undefined);
});

test('list() orders by createdAt ascending', () => {
  const repo = makeRepo();
  const first = repo.create('/Users/example/first');
  const second = repo.create('/Users/example/second');

  const listed = repo.list();
  assert.deepEqual(
    listed.map((p) => p.id),
    [first.id, second.id],
  );
});
