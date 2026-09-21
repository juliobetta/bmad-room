import type { IPty } from 'node-pty';
import { messagesRepo, personasRepo, projectsRepo, threadsRepo } from '@/lib/db';
import { classifyLine } from '@/parsing/classifier';
import { TerminalBuffer } from '@/parsing/terminal-buffer';
import type { MessagesRepo } from '@/persistence/messages-repo';
import type { PersonasRepo } from '@/persistence/personas-repo';
import type { ProjectsRepo } from '@/persistence/projects-repo';
import type { ThreadStatus } from '@/persistence/schema';
import type { Thread, ThreadsRepo } from '@/persistence/threads-repo';
import { activateProject as activateProjectDefault } from '@/pty/activateProject';
import { spawnClaude as spawnClaudeDefault } from '@/pty/spawn';
import { publishPresence } from '@/ws/presence';
import type { WsEvent } from '@/ws/types';

const DEFAULT_IDLE_REAP_MS = 30 * 60 * 1000;

type Listener = (event: WsEvent) => void;

export interface ThreadActorDeps {
  activateProject: typeof activateProjectDefault;
  spawnClaude: typeof spawnClaudeDefault;
  threadsRepo: Pick<ThreadsRepo, 'findById' | 'updateStatus'>;
  projectsRepo: Pick<ProjectsRepo, 'findById'>;
  personasRepo: Pick<PersonasRepo, 'findById'>;
  messagesRepo: Pick<MessagesRepo, 'create'>;
  idleReapMs: number;
}

const defaultDeps: ThreadActorDeps = {
  activateProject: activateProjectDefault,
  spawnClaude: spawnClaudeDefault,
  threadsRepo,
  projectsRepo,
  personasRepo,
  messagesRepo,
  idleReapMs: DEFAULT_IDLE_REAP_MS,
};

/**
 * One long-lived actor per open thread, owning its pty's full lifecycle
 * (AD-1): spawns on first message, stays alive across turns, self-enforces
 * idle-reap and crash handling. Deregistration is always self-initiated —
 * nothing else may kill this actor's pty or reach into its state.
 */
export class ThreadActor {
  private readonly deps: ThreadActorDeps;
  private pty: IPty | null = null;
  private terminalBuffer: TerminalBuffer | null = null;
  private readonly subscribers = new Set<Listener>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightTurn = false;
  private streamingText = '';
  private lastBroadcastStatus: ThreadStatus | null = null;
  private deregistered = false;
  // Guards against two concurrent `sendMessage()` calls both observing
  // `this.pty === null` and each starting their own `spawnPty()` (e.g. two
  // WS frames arriving before the first activation/spawn resolves) — a
  // second concurrent call awaits this same in-flight spawn instead.
  private spawning: Promise<boolean> | null = null;
  // Set immediately before this actor calls `pty.kill()` itself (idle-reap
  // today; a future stop-turn command would set it too). node-pty's
  // `onExit` still fires after a self-initiated kill — real pty exits are
  // always async, but nothing guarantees that timing — so `handleCrash`
  // checks this flag to avoid double-reporting a teardown this actor
  // already handled.
  private killingIntentionally = false;

  constructor(
    private readonly threadId: string,
    private readonly deregister: () => void,
    deps: Partial<ThreadActorDeps> = {},
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  subscribe(listener: Listener): () => void {
    this.subscribers.add(listener);
    this.resetIdleTimer();
    return () => {
      this.subscribers.delete(listener);
      this.resetIdleTimer();
    };
  }

  hasLivePty(): boolean {
    return this.pty !== null;
  }

  /** Handles a `send-message` command: the only mailbox message this story defines. */
  async sendMessage(text: string): Promise<void> {
    const thread = this.deps.threadsRepo.findById(this.threadId);
    if (!thread) {
      throw new Error(`ThreadActor: unknown thread ${this.threadId}`);
    }

    const userMessage = this.deps.messagesRepo.create(this.threadId, 'text', text, null);
    this.broadcast({
      type: 'message.complete',
      threadId: this.threadId,
      payload: { messageId: userMessage.id, speakerPersonaId: null, kind: 'text', content: text },
      ts: Date.now(),
    });

    if (!this.pty) {
      const spawned = await this.getOrStartSpawn(thread);
      if (!spawned) return; // activation/removed-persona/spawn failure — never spawn, already reported.
    }

    this.inFlightTurn = true;
    this.setStatus('working');
    this.pty?.write(`${text}\n`);
    this.resetIdleTimer();
  }

  /** Shares one in-flight spawn across concurrent `sendMessage()` calls. */
  private getOrStartSpawn(thread: Thread): Promise<boolean> {
    if (!this.spawning) {
      this.spawning = this.spawnPty(thread).finally(() => {
        this.spawning = null;
      });
    }
    return this.spawning;
  }

  private async spawnPty(thread: Thread): Promise<boolean> {
    const persona = thread.personaId ? this.deps.personasRepo.findById(thread.personaId) : undefined;
    if (thread.personaId && persona?.status === 'removed') {
      this.failActivation('This persona has been removed');
      return false;
    }

    const project = this.deps.projectsRepo.findById(thread.projectId);
    if (!project) {
      this.failActivation('Project no longer exists');
      return false;
    }

    const activation = await this.deps.activateProject(project.path);
    if (!activation.ok) {
      this.failActivation(activation.reason);
      return false;
    }

    let pty: IPty;
    try {
      pty = this.deps.spawnClaude({ cwd: activation.cwd });
    } catch (err) {
      this.failActivation(`Failed to start the persona process: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    this.pty = pty;
    this.terminalBuffer = new TerminalBuffer((line) => this.handleLine(line, thread));

    pty.onData((chunk) => this.terminalBuffer?.write(chunk));
    pty.onExit(({ exitCode, signal }) => this.handleCrash(exitCode, signal));

    // Persona invocation (frozen decision): first spawn only, before the
    // user's actual message, mirrors this tool's own `/<skill-name>`
    // slash-command convention.
    if (persona) {
      pty.write(`/${persona.agentSkillId}\n`);
    }

    return true;
  }

  private failActivation(reason: string): void {
    this.deps.threadsRepo.updateStatus(this.threadId, 'stopped');
    const message = this.deps.messagesRepo.create(this.threadId, 'system', reason, null);
    this.broadcast({
      type: 'system',
      threadId: this.threadId,
      payload: { messageId: message.id, content: reason },
      ts: Date.now(),
    });
    this.lastBroadcastStatus = 'stopped';
    this.broadcast({ type: 'status', threadId: this.threadId, payload: { status: 'stopped' }, ts: Date.now() });
    publishPresence({ threadId: this.threadId, status: 'stopped' });
  }

  private handleLine(rawLine: string, thread: Thread): void {
    const classified = classifyLine(rawLine);
    switch (classified.kind) {
      case 'ignore':
        return;
      case 'status':
        if (classified.status === 'idle') {
          this.completeTurnIfAny(thread);
          this.setStatus('idle');
        } else {
          this.inFlightTurn = true;
          this.setStatus('working');
        }
        return;
      case 'system': {
        const message = this.deps.messagesRepo.create(this.threadId, 'system', classified.text, null);
        this.broadcast({
          type: 'system',
          threadId: this.threadId,
          payload: { messageId: message.id, content: classified.text },
          ts: Date.now(),
        });
        return;
      }
      case 'message': {
        this.inFlightTurn = true;
        this.streamingText = this.streamingText ? `${this.streamingText}\n${classified.text}` : classified.text;
        this.broadcast({
          type: 'message.delta',
          threadId: this.threadId,
          payload: { speakerPersonaId: thread.personaId, content: this.streamingText },
          ts: Date.now(),
        });
        return;
      }
      default:
        return;
    }
  }

  private completeTurnIfAny(thread: Thread): void {
    if (!this.inFlightTurn || this.streamingText.trim().length === 0) {
      this.inFlightTurn = false;
      this.streamingText = '';
      return;
    }
    const content = this.streamingText;
    const message = this.deps.messagesRepo.create(this.threadId, 'text', content, thread.personaId);
    this.broadcast({
      type: 'message.complete',
      threadId: this.threadId,
      payload: { messageId: message.id, speakerPersonaId: thread.personaId, kind: 'text', content },
      ts: Date.now(),
    });
    this.streamingText = '';
    this.inFlightTurn = false;
  }

  /**
   * Flushes the terminal buffer's not-yet-settled trailing line (the one
   * still on the live cursor row, which would otherwise never be
   * classified/emitted since no further chunk is coming to push it past
   * the cursor) and, if that leaves any lingering `streamingText`,
   * persists/broadcasts it as the turn's final message instead of
   * silently discarding it. Must be called before the terminal buffer is
   * disposed.
   */
  private flushLingeringTurn(): void {
    this.terminalBuffer?.flush();
    if (this.streamingText.trim().length === 0) {
      this.streamingText = '';
      this.inFlightTurn = false;
      return;
    }
    const thread = this.deps.threadsRepo.findById(this.threadId);
    if (!thread) {
      this.streamingText = '';
      this.inFlightTurn = false;
      return;
    }
    this.completeTurnIfAny(thread);
  }

  private handleCrash(exitCode: number, signal?: number): void {
    if (this.killingIntentionally) {
      // Already fully handled by whichever actor-owned path called kill().
      this.killingIntentionally = false;
      return;
    }
    this.flushLingeringTurn();
    this.pty = null;
    this.terminalBuffer?.dispose();
    this.terminalBuffer = null;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.deps.threadsRepo.updateStatus(this.threadId, 'stopped');
    const reason = `The persona process exited unexpectedly (code ${exitCode}${signal ? `, signal ${signal}` : ''}).`;
    const message = this.deps.messagesRepo.create(this.threadId, 'system', reason, null);
    this.broadcast({
      type: 'system',
      threadId: this.threadId,
      payload: { messageId: message.id, content: reason },
      ts: Date.now(),
    });
    this.lastBroadcastStatus = 'stopped';
    this.broadcast({ type: 'status', threadId: this.threadId, payload: { status: 'stopped' }, ts: Date.now() });
    publishPresence({ threadId: this.threadId, status: 'stopped' });

    this.inFlightTurn = false;
    this.streamingText = '';
    this.deregisterSelf();
  }

  private setStatus(status: ThreadStatus): void {
    this.deps.threadsRepo.updateStatus(this.threadId, status);
    publishPresence({ threadId: this.threadId, status });
    if (this.lastBroadcastStatus !== status) {
      this.lastBroadcastStatus = status;
      this.broadcast({ type: 'status', threadId: this.threadId, payload: { status }, ts: Date.now() });
    }
    this.resetIdleTimer();
  }

  private broadcast(event: WsEvent): void {
    for (const listener of this.subscribers) listener(event);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (!this.pty) return;
    if (this.subscribers.size > 0 || this.inFlightTurn) return;

    this.idleTimer = setTimeout(() => this.reapIdle(), this.deps.idleReapMs);
    // Don't let this timer keep the process alive (dev/test convenience).
    (this.idleTimer as unknown as { unref?: () => void }).unref?.();
  }

  private reapIdle(): void {
    if (this.subscribers.size > 0 || this.inFlightTurn) return; // race guard
    this.killingIntentionally = true;
    this.pty?.kill();
    this.pty = null;
    this.flushLingeringTurn();
    this.terminalBuffer?.dispose();
    this.terminalBuffer = null;

    this.deps.threadsRepo.updateStatus(this.threadId, 'stopped');
    const reason = 'Idle for 30 minutes with no active viewers — persona process stopped.';
    const message = this.deps.messagesRepo.create(this.threadId, 'system', reason, null);
    this.broadcast({
      type: 'system',
      threadId: this.threadId,
      payload: { messageId: message.id, content: reason },
      ts: Date.now(),
    });
    this.lastBroadcastStatus = 'stopped';
    this.broadcast({ type: 'status', threadId: this.threadId, payload: { status: 'stopped' }, ts: Date.now() });
    publishPresence({ threadId: this.threadId, status: 'stopped' });

    this.deregisterSelf();
  }

  private deregisterSelf(): void {
    if (this.deregistered) return;
    this.deregistered = true;
    this.deregister();
  }
}
