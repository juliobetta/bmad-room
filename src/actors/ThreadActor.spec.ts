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

  test('a tool-invocation line mints a tool-card row before broadcasting tool-card.open, and growing/finishing output patches it', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('edit the file');

    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasks();

    const openEvent = events.find((e) => e.type === 'tool-card.open');
    expect(openEvent).toBeDefined();
    if (openEvent?.type !== 'tool-card.open') throw new Error('unreachable');
    expect(openEvent.payload.parentMessageId).toBeNull();
    expect(openEvent.payload.summary).toBe('⏺ Read(src/api/auth.ts)');

    const persistedOpen = repos.messages.listByThread(thread.id).find((m) => m.id === openEvent.payload.messageId);
    expect(persistedOpen?.kind).toBe('tool-card');
    expect(persistedOpen?.parentMessageId).toBeNull();
    expect(JSON.parse(persistedOpen?.content ?? '{}')).toEqual({ summary: '⏺ Read(src/api/auth.ts)', detail: '' });

    fakePty.emitData('  ⎿  Read 120 lines\r\n');
    await flushMicrotasks();

    const updateEvent = events.find((e) => e.type === 'tool-card.update');
    expect(updateEvent).toBeDefined();
    if (updateEvent?.type !== 'tool-card.update') throw new Error('unreachable');
    expect(updateEvent.payload.messageId).toBe(openEvent.payload.messageId);
    expect(updateEvent.payload.detail).toBe('Read 120 lines');

    fakePty.emitData('  ⎿  Read 120 lines (2.1s)\r\n');
    await flushMicrotasks();

    const closeEvent = events.find((e) => e.type === 'tool-card.close');
    expect(closeEvent).toBeDefined();
    if (closeEvent?.type !== 'tool-card.close') throw new Error('unreachable');
    expect(closeEvent.payload.messageId).toBe(openEvent.payload.messageId);
    expect(closeEvent.payload.detail).toBe('Read 120 lines\nRead 120 lines (2.1s)');

    const persistedClosed = repos.messages.listByThread(thread.id).find((m) => m.id === openEvent.payload.messageId);
    expect(JSON.parse(persistedClosed?.content ?? '{}')).toEqual({
      summary: '⏺ Read(src/api/auth.ts)',
      detail: 'Read 120 lines\nRead 120 lines (2.1s)',
    });
  });

  test('a Task(...) invocation while a tool-card is open spawns a nested subagent-card', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('do a broad search');

    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasks();
    const toolOpen = events.find((e) => e.type === 'tool-card.open');
    if (toolOpen?.type !== 'tool-card.open') throw new Error('unreachable');

    fakePty.emitData('⏺ Task(Explore the auth flow)\r\n');
    await flushMicrotasks();

    const subagentOpen = events.find((e) => e.type === 'subagent-card.open');
    expect(subagentOpen).toBeDefined();
    if (subagentOpen?.type !== 'subagent-card.open') throw new Error('unreachable');
    expect(subagentOpen.payload.parentMessageId).toBe(toolOpen.payload.messageId);

    const persisted = repos.messages.listByThread(thread.id).find((m) => m.id === subagentOpen.payload.messageId);
    expect(persisted?.kind).toBe('subagent-card');
    expect(persisted?.parentMessageId).toBe(toolOpen.payload.messageId);

    // card-close resolves to the most-recently-opened card (the subagent).
    fakePty.emitData('  ⎿  Done (12 tool uses · 3m 12s)\r\n');
    await flushMicrotasks();
    const subagentClose = events.find((e) => e.type === 'subagent-card.close');
    expect(subagentClose).toBeDefined();
    if (subagentClose?.type !== 'subagent-card.close') throw new Error('unreachable');
    expect(subagentClose.payload.messageId).toBe(subagentOpen.payload.messageId);

    // Closing again resolves to the tool-card underneath it.
    fakePty.emitData('  ⎿  Read 120 lines (2.1s)\r\n');
    await flushMicrotasks();
    const toolClose = events.find((e) => e.type === 'tool-card.close');
    expect(toolClose).toBeDefined();
    if (toolClose?.type !== 'tool-card.close') throw new Error('unreachable');
    expect(toolClose.payload.messageId).toBe(toolOpen.payload.messageId);
  });

  test('a Task(...) invocation with no tool-card open becomes a top-level subagent-card', async () => {
    const { actor, events, fakePty } = setup();
    await actor.sendMessage('spawn a subagent directly');

    fakePty.emitData('⏺ Task(Explore the auth flow)\r\n');
    await flushMicrotasks();

    const subagentOpen = events.find((e) => e.type === 'subagent-card.open');
    expect(subagentOpen).toBeDefined();
    if (subagentOpen?.type !== 'subagent-card.open') throw new Error('unreachable');
    expect(subagentOpen.payload.parentMessageId).toBeNull();
  });

  test('flushLingeringTurn (idle-reap) best-effort finalizes a still-open card without losing content', async () => {
    vi.useFakeTimers();
    const { actor, thread, fakePty, repos, unsubscribe } = setup(50);
    await actor.sendMessage('hello');
    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasksFake();
    fakePty.emitData('  ⎿  Read 120 lines\r\n');
    await flushMicrotasksFake();

    unsubscribe();
    await vi.advanceTimersByTimeAsync(60);

    const rows = repos.messages.listByThread(thread.id);
    const toolRow = rows.find((m) => m.kind === 'tool-card');
    expect(toolRow).toBeDefined();
    expect(JSON.parse(toolRow?.content ?? '{}')).toEqual({
      summary: '⏺ Read(src/api/auth.ts)',
      detail: 'Read 120 lines',
    });
    vi.useRealTimers();
  });

  test('text streamed before a mid-turn tool call is committed as its own message before the card opens', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('look into it');

    fakePty.emitData("I'll check the auth file first.\r\n");
    await flushMicrotasks();

    // Not yet committed — still only streaming as a delta until the card opens.
    expect(events.some((e) => e.type === 'message.complete' && e.payload.speakerPersonaId)).toBe(false);

    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasks();

    const commitIndex = events.findIndex(
      (e) => e.type === 'message.complete' && e.payload.speakerPersonaId === 'bmad-agent-analyst',
    );
    expect(commitIndex).toBeGreaterThanOrEqual(0);
    if (events[commitIndex]?.type !== 'message.complete') throw new Error('unreachable');
    expect(events[commitIndex].payload.content).toBe("I'll check the auth file first.");
    expect(events[commitIndex].payload.speakerPersonaId).toBe('bmad-agent-analyst');

    const openIndex = events.findIndex((e) => e.type === 'tool-card.open');
    expect(openIndex).toBeGreaterThan(commitIndex);

    // The turn is still running: the persisted text row precedes the card
    // row, but the turn itself isn't reset. `listByThread` returns rowid
    // DESC (most-recent first), so the earlier row (the text) sorts after
    // the later one (the card) in this listing.
    const persisted = repos.messages.listByThread(thread.id);
    const textRow = persisted.find((m) => m.content === "I'll check the auth file first.");
    const cardRow = persisted.find((m) => m.kind === 'tool-card');
    expect(textRow).toBeDefined();
    expect(cardRow).toBeDefined();
    if (!textRow || !cardRow) throw new Error('unreachable');
    expect(persisted.indexOf(textRow)).toBeGreaterThan(persisted.indexOf(cardRow));

    // Turn is still in flight — an idle line afterward still completes any
    // further streamed text as a distinct, later message.
    fakePty.emitData('  ⎿  Read 120 lines (2.1s)\r\n');
    await flushMicrotasks();
    fakePty.emitData('All done.\r\n> \r\n');
    await flushMicrotasks();

    const finalComplete = events.filter((e) => e.type === 'message.complete');
    expect(finalComplete.length).toBeGreaterThanOrEqual(2);
  });

  test('an idle status line closes any still-open card even if the classifier never emitted card-close', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('edit the file');

    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasks();
    const openEvent = events.find((e) => e.type === 'tool-card.open');
    if (openEvent?.type !== 'tool-card.open') throw new Error('unreachable');

    // Go straight to the idle prompt without a matching card-close line.
    fakePty.emitData('> \r\n');
    await flushMicrotasks();

    const closeEvent = events.find((e) => e.type === 'tool-card.close');
    expect(closeEvent).toBeDefined();
    if (closeEvent?.type !== 'tool-card.close') throw new Error('unreachable');
    expect(closeEvent.payload.messageId).toBe(openEvent.payload.messageId);

    const persisted = repos.messages.listByThread(thread.id).find((m) => m.id === openEvent.payload.messageId);
    expect(JSON.parse(persisted?.content ?? '{}').summary).toBe('⏺ Read(src/api/auth.ts)');
  });

  test('a card-update line with no card open falls back to an ordinary streamed-text line', async () => {
    const { actor, events, fakePty } = setup();
    await actor.sendMessage('hello');

    // A duration-suffixed continuation line ("card-close" shape) with no
    // card open falls back to a streamed-text line too.
    fakePty.emitData('  ⎿  Orphaned continuation line (2.1s)\r\n');
    await flushMicrotasks();

    const delta = events.find((e) => e.type === 'message.delta');
    expect(delta).toBeDefined();
    if (delta?.type !== 'message.delta') throw new Error('unreachable');
    expect(delta.payload.content).toContain('Orphaned continuation line (2.1s)');
    expect(events.some((e) => e.type === 'tool-card.update' || e.type === 'tool-card.close')).toBe(false);
  });

  test('tool-card.open broadcasts speakerPersonaId matching the persisted row', async () => {
    const { actor, events, repos, thread, fakePty } = setup();
    await actor.sendMessage('edit the file');

    fakePty.emitData('⏺ Read(src/api/auth.ts)\r\n');
    await flushMicrotasks();

    const openEvent = events.find((e) => e.type === 'tool-card.open');
    if (openEvent?.type !== 'tool-card.open') throw new Error('unreachable');
    expect(openEvent.payload.speakerPersonaId).toBe('bmad-agent-analyst');

    const persisted = repos.messages.listByThread(thread.id).find((m) => m.id === openEvent.payload.messageId);
    expect(persisted?.speakerPersonaId).toBe(openEvent.payload.speakerPersonaId);
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
