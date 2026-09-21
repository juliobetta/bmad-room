import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { PersonasRepo } from './personas-repo';
import { ProjectsRepo } from './projects-repo';
import { initSchema } from './schema';
import { ThreadsRepo } from './threads-repo';

function makeRepos() {
  const db = new Database(':memory:');
  initSchema(db);
  return {
    threads: new ThreadsRepo(db),
    projects: new ProjectsRepo(db),
    personas: new PersonasRepo(db),
  };
}

const analystAgent = {
  agentSkillId: 'bmad-agent-analyst',
  name: 'Mary',
  title: 'Business Analyst',
  icon: '📊',
  description: 'Grounds every finding in verifiable evidence.',
  module: 'bmm',
};

describe('ThreadsRepo', () => {
  test('listByProject() returns an empty array when no threads exist', () => {
    const { threads } = makeRepos();
    expect(threads.listByProject('some-project')).toEqual([]);
  });

  test('findOrCreateDm() creates a Thread row (kind=dm) for a persona never messaged in this project', () => {
    const { threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const project = projects.create('/Users/example/repo');

    const thread = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

    expect(thread.projectId).toBe(project.id);
    expect(thread.personaId).toBe('bmad-agent-analyst');
    expect(thread.kind).toBe('dm');
    expect(thread.status).toBe('idle');
    expect(typeof thread.id).toBe('string');
    expect(thread.id.length).toBeGreaterThan(0);
  });

  test('findOrCreateDm() reopens the same thread on a second call, no duplicate row', () => {
    const { threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const project = projects.create('/Users/example/repo');

    const first = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');
    const second = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

    expect(second).toEqual(first);
    expect(threads.listByProject(project.id).length).toBe(1);
  });

  test('findOrCreateDm() creates a distinct Thread row for the same persona in a different project', () => {
    const { threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const projectA = projects.create('/Users/example/repo-a');
    const projectB = projects.create('/Users/example/repo-b');

    const threadA = threads.findOrCreateDm(projectA.id, 'bmad-agent-analyst');
    const threadB = threads.findOrCreateDm(projectB.id, 'bmad-agent-analyst');

    expect(threadA.id).not.toBe(threadB.id);
    expect(threadA.projectId).toBe(projectA.id);
    expect(threadB.projectId).toBe(projectB.id);
  });

  test('findDm() returns undefined when no dm thread exists yet', () => {
    const { threads, projects } = makeRepos();
    const project = projects.create('/Users/example/repo');
    expect(threads.findDm(project.id, 'bmad-agent-analyst')).toBeUndefined();
  });

  test('findById() returns undefined for an unknown thread id', () => {
    const { threads } = makeRepos();
    expect(threads.findById('does-not-exist')).toBeUndefined();
  });

  test('findById() returns the thread matching that id', () => {
    const { threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const project = projects.create('/Users/example/repo');
    const created = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

    expect(threads.findById(created.id)).toEqual(created);
  });

  test('updateStatus() persists a new status for the given thread', () => {
    const { threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const project = projects.create('/Users/example/repo');
    const created = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

    threads.updateStatus(created.id, 'stopped');

    expect(threads.findById(created.id)?.status).toBe('stopped');
  });
});
