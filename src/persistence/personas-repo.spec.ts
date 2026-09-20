import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { PersonasRepo, type SyncedAgent } from './personas-repo';
import { initSchema } from './schema';

function makeRepo(): PersonasRepo {
  const db = new Database(':memory:');
  initSchema(db);
  return new PersonasRepo(db);
}

const analyst: SyncedAgent = {
  agentSkillId: 'bmad-agent-analyst',
  name: 'Mary',
  title: 'Business Analyst',
  icon: '📊',
  description: 'Grounds every finding in verifiable evidence.',
  module: 'bmm',
};

const pm: SyncedAgent = {
  agentSkillId: 'bmad-agent-pm',
  name: 'John',
  title: 'Product Manager',
  icon: '📋',
  description: 'Drives PRD creation.',
  module: 'bmm',
};

describe('PersonasRepo', () => {
  test('list() returns an empty array when no personas exist', () => {
    const repo = makeRepo();
    expect(repo.list()).toEqual([]);
  });

  test('upsertMany() inserts new personas as status=active', () => {
    const repo = makeRepo();
    repo.upsertMany([analyst, pm]);

    const listed = repo.list();
    expect(listed.length).toBe(2);
    const found = repo.findById('bmad-agent-analyst');
    expect(found).toMatchObject({ ...analyst, status: 'active' });
    expect(typeof found?.syncedAt).toBe('string');
    expect(Number.isNaN(Date.parse(found?.syncedAt ?? ''))).toBe(false);
  });

  test('upsertMany() updates fields on an existing agentSkillId without duplicating rows', () => {
    const repo = makeRepo();
    repo.upsertMany([analyst]);
    repo.upsertMany([{ ...analyst, title: 'Senior Business Analyst' }]);

    const listed = repo.list();
    expect(listed.length).toBe(1);
    expect(listed[0]?.title).toBe('Senior Business Analyst');
  });

  test('markRemoved() marks agentSkillIds absent from idsStillPresent as removed, never deletes', () => {
    const repo = makeRepo();
    repo.upsertMany([analyst, pm]);

    repo.markRemoved(['bmad-agent-analyst']);

    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('removed');
    expect(repo.list().length).toBe(2);
  });

  test('a re-sync where an agentSkillId still exists leaves its row unchanged', () => {
    const repo = makeRepo();
    repo.upsertMany([analyst]);
    const before = repo.findById('bmad-agent-analyst');

    repo.upsertMany([analyst]);
    repo.markRemoved(['bmad-agent-analyst']);
    const after = repo.findById('bmad-agent-analyst');

    expect(after).toMatchObject({
      agentSkillId: before?.agentSkillId,
      name: before?.name,
      title: before?.title,
      icon: before?.icon,
      description: before?.description,
      module: before?.module,
      status: 'active',
    });
  });

  test('findById() returns undefined for an unknown id', () => {
    const repo = makeRepo();
    expect(repo.findById('does-not-exist')).toBeUndefined();
  });

  test('markRemoved([]) is a no-op, leaving existing active rows untouched', () => {
    const repo = makeRepo();
    repo.upsertMany([analyst, pm]);

    repo.markRemoved([]);

    expect(repo.findById('bmad-agent-analyst')?.status).toBe('active');
    expect(repo.findById('bmad-agent-pm')?.status).toBe('active');
    expect(repo.list().length).toBe(2);
  });
});
