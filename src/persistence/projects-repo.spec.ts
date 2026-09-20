import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { ProjectsRepo } from './projects-repo';
import { initSchema } from './schema';

function makeRepo(): ProjectsRepo {
  const db = new Database(':memory:');
  initSchema(db);
  return new ProjectsRepo(db);
}

describe('ProjectsRepo', () => {
  test('list() returns an empty array when no projects exist', () => {
    const repo = makeRepo();
    expect(repo.list()).toEqual([]);
  });

  test('create() persists a Project row with nanoid id and ISO-8601 createdAt', () => {
    const repo = makeRepo();
    const project = repo.create('/Users/example/repo');

    expect(typeof project.id).toBe('string');
    expect(project.id.length).toBeGreaterThan(0);
    expect(project.path).toBe('/Users/example/repo');
    expect(Number.isNaN(Date.parse(project.createdAt))).toBe(false);

    const listed = repo.list();
    expect(listed.length).toBe(1);
    expect(listed[0]).toEqual(project);
  });

  test('findById() finds an existing project by id', () => {
    const repo = makeRepo();
    repo.create('/Users/example/repo-a');
    const created = repo.create('/Users/example/repo-b');

    const found = repo.findById(created.id);
    expect(found).toEqual(created);

    const notFound = repo.findById('does-not-exist');
    expect(notFound).toBeUndefined();
  });

  test('findByPath() finds an existing project by exact path', () => {
    const repo = makeRepo();
    repo.create('/Users/example/repo-a');
    const created = repo.create('/Users/example/repo-b');

    const found = repo.findByPath('/Users/example/repo-b');
    expect(found).toEqual(created);

    const notFound = repo.findByPath('/Users/example/does-not-exist');
    expect(notFound).toBeUndefined();
  });

  test('list() orders by createdAt ascending', () => {
    const repo = makeRepo();
    const first = repo.create('/Users/example/first');
    const second = repo.create('/Users/example/second');

    const listed = repo.list();
    expect(listed.map((p) => p.id)).toEqual([first.id, second.id]);
  });
});
