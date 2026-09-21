import Database from 'better-sqlite3';
import type { IPty } from 'node-pty';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MessagesRepo } from '@/persistence/messages-repo';
import { PersonasRepo } from '@/persistence/personas-repo';
import { ProjectsRepo } from '@/persistence/projects-repo';
import { initSchema } from '@/persistence/schema';
import { ThreadsRepo } from '@/persistence/threads-repo';
import type { ActivateProjectResult } from '@/pty/activateProject';
import type { WsEvent } from '@/ws/types';
import { ThreadActor } from './ThreadActor';

/**
 * Fake pty double: node-pty's real events are async (a real process exits
 * on its own schedule); this fake fires them synchronously so tests can
 * drive it deterministically without a real `claude` binary.
 */
class FakePty {
  pid = 4242;
  cols = 120;
  rows = 40;
  process = 'claude';
  handleFlowControl = false;
  written: string[] = [];
  killed = false;
  private dataListeners: Array<(chunk: string) => void> = [];
  private exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  onData = (cb: (chunk: string) => void) => {
    this.dataListeners.push(cb);
    return { dispose: () => {} };
  };

  onExit = (cb: (e: { exitCode: number; signal?: number }) => void) => {
    this.exitListeners.push(cb);
    return { dispose: () => {} };
  };

  write(data: string): void {
    this.written.push(data);
  }

  kill(): void {
    this.killed = true;
    this.emitExit(0);
  }

  resize(): void {}
  clear(): void {}
  pause(): void {}
  resume(): void {}

  emitData(chunk: string): void {
    for (const listener of this.dataListeners) listener(chunk);
  }

  emitExit(exitCode: number, signal?: number): void {
    for (const listener of this.exitListeners) listener({ exitCode, signal });
  }
}

function makeRepos() {
  const db = new Database(':memory:');
  initSchema(db);
  return {
    threads: new ThreadsRepo(db),
    projects: new ProjectsRepo(db),
    personas: new PersonasRepo(db),
    messages: new MessagesRepo(db),
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

function setup(idleReapMs = DEFAULT_TEST_IDLE_REAP_MS) {
  const repos = makeRepos();
  repos.personas.upsertMany([analystAgent]);
  const project = repos.projects.create('/Users/example/repo');
  const thread = repos.threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

  const fakePty = new FakePty();
  const spawnClaude = vi.fn(() => fakePty as unknown as IPty);
  const activateProject = vi.fn(async (): Promise<ActivateProjectResult> => ({ ok: true, cwd: '/Users/example/repo' }));

  const deregister = vi.fn();
  const events: WsEvent[] = [];

  const actor = new ThreadActor(thread.id, deregister, {
    activateProject,
    spawnClaude,
    threadsRepo: repos.threads,
    projectsRepo: repos.projects,
    personasRepo: repos.personas,
    messagesRepo: repos.messages,
    idleReapMs,
  });
  const unsubscribe = actor.subscribe((event) => events.push(event));

  return { repos, project, thread, fakePty, spawnClaude, activateProject, deregister, events, actor, unsubscribe };
}

const DEFAULT_TEST_IDLE_REAP_MS = 30 * 60 * 1000;

describe('ThreadActor', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  test('sendMessage() on a fresh thread activates the project, spawns a pty, and invokes the persona skill first', async () => {
    const { actor, fakePty, activateProject, spawnClaude } = setup();

    await actor.sendMessage('hello there');

    expect(activateProject).toHaveBeenCalledWith('/Users/example/repo');
    expect(spawnClaude).toHaveBeenCalledWith({ cwd: '/Users/example/repo' });
    expect(fakePty.written[0]).toBe('/bmad-agent-analyst\n');
    expect(fakePty.written[1]).toBe('hello there\n');
  });

  test('sendMessage() persists the user message and broadcasts message.complete for it', async () => {
    const { actor, events, repos, thread } = setup();

    await actor.sendMessage('hello there');

    const persisted = repos.messages.listByThread(thread.id);
    const userRow = persisted.find((m) => m.content === 'hello there');
    expect(userRow?.speakerPersonaId).toBeNull();
    expect(userRow?.kind).toBe('text');

    const userEvent = events.find((e) => e.type === 'message.complete' && e.payload.content === 'hello there');
    expect(userEvent).toBeDefined();
  });

  test('a follow-up message on an already-live pty does not re-activate or re-spawn', async () => {
    const { actor, activateProject, spawnClaude } = setup();

    await actor.sendMessage('first');
    await actor.sendMessage('second');

    expect(activateProject).toHaveBeenCalledTimes(1);
    expect(spawnClaude).toHaveBeenCalledTimes(1);
  });

  test('pty output renders as message.delta events, and returning to the idle prompt persists and completes the turn', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('hello');

    fakePty.emitData('Hi, I can help with that.\r\n');
    await flushMicrotasks();
    fakePty.emitData('> \r\n');
    await flushMicrotasks();

    const deltas = events.filter((e) => e.type === 'message.delta');
    expect(deltas.length).toBeGreaterThan(0);

    const complete = events.find(
      (e) => e.type === 'message.complete' && e.payload.speakerPersonaId === 'bmad-agent-analyst',
    );
    expect(complete).toBeDefined();
    if (complete?.type === 'message.complete') {
      expect(complete.payload.content).toContain('Hi, I can help with that.');
    }

    const persisted = repos.messages.listByThread(thread.id);
    const personaRow = persisted.find((m) => m.speakerPersonaId === 'bmad-agent-analyst');
    expect(personaRow?.kind).toBe('text');

    expect(repos.threads.findById(thread.id)?.status).toBe('idle');
  });

  test('activateProject() failure never spawns a pty, persists status=stopped, and emits exactly one system event', async () => {
    const repos = makeRepos();
    repos.personas.upsertMany([analystAgent]);
    const project = repos.projects.create('/Users/example/repo');
    const thread = repos.threads.findOrCreateDm(project.id, 'bmad-agent-analyst');

    const spawnClaude = vi.fn();
    const activateProject = vi.fn(
      async (): Promise<ActivateProjectResult> => ({ ok: false, reason: 'no .git directory' }),
    );
    const events: WsEvent[] = [];

    const actor = new ThreadActor(thread.id, vi.fn(), {
      activateProject,
      spawnClaude: spawnClaude as never,
      threadsRepo: repos.threads,
      projectsRepo: repos.projects,
      personasRepo: repos.personas,
      messagesRepo: repos.messages,
      idleReapMs: DEFAULT_TEST_IDLE_REAP_MS,
    });
    actor.subscribe((event) => events.push(event));

    await actor.sendMessage('hello');

    expect(spawnClaude).not.toHaveBeenCalled();
    expect(repos.threads.findById(thread.id)?.status).toBe('stopped');

    const systemEvents = events.filter((e) => e.type === 'system');
    expect(systemEvents).toHaveLength(1);
    if (systemEvents[0]?.type === 'system') {
      expect(systemEvents[0].payload.content).toBe('no .git directory');
    }
  });

  test('a pty crash mid-turn tears down actor state, persists status=stopped, emits one system event, and deregisters', async () => {
    const { actor, events, repos, thread, fakePty, deregister } = setup();
    await actor.sendMessage('hello');

    fakePty.emitExit(1);

    expect(repos.threads.findById(thread.id)?.status).toBe('stopped');
    expect(events.filter((e) => e.type === 'system')).toHaveLength(1);
    expect(deregister).toHaveBeenCalledTimes(1);
    expect(actor.hasLivePty()).toBe(false);
  });

  test('idle-reap kills the pty, persists status=stopped, emits one system event, and deregisters exactly once', async () => {
    vi.useFakeTimers();
    const { actor, repos, thread, fakePty, deregister, unsubscribe } = setup(50);
    await actor.sendMessage('hello');
    fakePty.emitData('done\r\n> \r\n');
    await flushMicrotasksFake();

    // No subscribers, no in-flight turn: drop the only subscriber so the
    // idle timer is actually armed.
    unsubscribe();

    await vi.advanceTimersByTimeAsync(60);

    expect(fakePty.killed).toBe(true);
    expect(repos.threads.findById(thread.id)?.status).toBe('stopped');
    // `unsubscribe()` above already dropped the only WS listener (that's
    // what arms the idle timer), so the reap's own `system` broadcast has
    // no listener left to observe — assert against the persisted row
    // instead, which the actor still writes regardless of subscribers.
    const systemRows = repos.messages.listByThread(thread.id).filter((m) => m.kind === 'system');
    expect(systemRows).toHaveLength(1);
    expect(systemRows[0]?.content).toContain('Idle for 30 minutes');
    expect(deregister).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushMicrotasksFake(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
