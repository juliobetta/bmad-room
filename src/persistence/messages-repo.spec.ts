import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { MessagesRepo } from './messages-repo';
import { PersonasRepo } from './personas-repo';
import { ProjectsRepo } from './projects-repo';
import { initSchema } from './schema';
import { ThreadsRepo } from './threads-repo';

function makeRepos() {
  const db = new Database(':memory:');
  initSchema(db);
  return {
    messages: new MessagesRepo(db),
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

function makeThread() {
  const { messages, threads, projects, personas } = makeRepos();
  personas.upsertMany([analystAgent]);
  const project = projects.create('/Users/example/repo');
  const thread = threads.findOrCreateDm(project.id, 'bmad-agent-analyst');
  return { messages, thread };
}

describe('MessagesRepo', () => {
  test('listByThread() returns an empty array when no messages exist', () => {
    const { messages, thread } = makeThread();
    expect(messages.listByThread(thread.id)).toEqual([]);
  });

  test('create() persists a user text message (speakerPersonaId=null)', () => {
    const { messages, thread } = makeThread();
    const message = messages.create(thread.id, 'text', 'hello there');

    expect(message.threadId).toBe(thread.id);
    expect(message.kind).toBe('text');
    expect(message.content).toBe('hello there');
    expect(message.speakerPersonaId).toBeNull();
    expect(message.parentMessageId).toBeNull();
    expect(typeof message.id).toBe('string');
    expect(message.id.length).toBeGreaterThan(0);
  });

  test('create() persists a persona-authored message with speakerPersonaId set', () => {
    const { messages, thread } = makeThread();
    const message = messages.create(thread.id, 'text', 'hi back', 'bmad-agent-analyst');
    expect(message.speakerPersonaId).toBe('bmad-agent-analyst');
  });

  test('create() persists a system message', () => {
    const { messages, thread } = makeThread();
    const message = messages.create(thread.id, 'system', 'Activation failed: no .git directory');
    expect(message.kind).toBe('system');
  });

  test('listByThread() returns messages newest-first up to the default limit', () => {
    const { messages, thread } = makeThread();
    messages.create(thread.id, 'text', 'first');
    messages.create(thread.id, 'text', 'second');
    messages.create(thread.id, 'text', 'third');

    const page = messages.listByThread(thread.id);
    expect(page.map((m) => m.content)).toEqual(['third', 'second', 'first']);
  });

  test('listByThread() respects a custom limit', () => {
    const { messages, thread } = makeThread();
    messages.create(thread.id, 'text', 'first');
    messages.create(thread.id, 'text', 'second');
    messages.create(thread.id, 'text', 'third');

    const page = messages.listByThread(thread.id, { limit: 2 });
    expect(page.map((m) => m.content)).toEqual(['third', 'second']);
  });

  test('listByThread() with before= pages backward from that message', () => {
    const { messages, thread } = makeThread();
    const first = messages.create(thread.id, 'text', 'first');
    messages.create(thread.id, 'text', 'second');
    messages.create(thread.id, 'text', 'third');

    const page = messages.listByThread(thread.id, { before: first.id });
    expect(page).toEqual([]);
  });

  test('listByThread() with before= on the newest message returns everything older', () => {
    const { messages, thread } = makeThread();
    messages.create(thread.id, 'text', 'first');
    messages.create(thread.id, 'text', 'second');
    const third = messages.create(thread.id, 'text', 'third');

    const page = messages.listByThread(thread.id, { before: third.id });
    expect(page.map((m) => m.content)).toEqual(['second', 'first']);
  });

  test('listByThread() with before= for an unknown message id returns an empty array', () => {
    const { messages, thread } = makeThread();
    messages.create(thread.id, 'text', 'first');
    expect(messages.listByThread(thread.id, { before: 'does-not-exist' })).toEqual([]);
  });

  test('listByThread() scopes to the given thread only', () => {
    const { messages, threads, projects, personas } = makeRepos();
    personas.upsertMany([analystAgent]);
    const projectA = projects.create('/Users/example/repo-a');
    const projectB = projects.create('/Users/example/repo-b');
    const threadA = threads.findOrCreateDm(projectA.id, 'bmad-agent-analyst');
    const threadB = threads.findOrCreateDm(projectB.id, 'bmad-agent-analyst');

    messages.create(threadA.id, 'text', 'in A');
    messages.create(threadB.id, 'text', 'in B');

    expect(messages.listByThread(threadA.id).map((m) => m.content)).toEqual(['in A']);
    expect(messages.listByThread(threadB.id).map((m) => m.content)).toEqual(['in B']);
  });
});
