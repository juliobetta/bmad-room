---
title: 'Send a Message and Get a Real, Grounded Response'
type: 'feature'
created: '2026-09-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c2192667b86fb4476715844149eb88f946233d9f'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A DM `Thread` (Story 1.3) has no pty, no messages, and no composer — a user can open a persona's thread but cannot actually talk to it or see real Claude Code execution.

**Approach:** Introduce the actor/pty/classifier/WS substrate (`ThreadActor`, `activateProject()`, render-then-classify pipeline, WS server) so a composer-submitted message spawns (or reuses) one long-lived pty-wrapped Claude Code CLI process per thread, streams its rendered output back as `message`/`status`/`system` WS events, and persists completed turns as `Message` rows.

## Boundaries & Constraints

**Always:** One `ThreadActor` per open thread owns its pty's full lifecycle (spawn on first message, stay alive across turns, self-enforced idle-reap at 30 min with no WS subscriber and no in-flight turn, self-handled crash). `activateProject()` is the only path that establishes a project's pty cwd (real checkout, `_bmad` symlink overlay, `.git/info/exclude` registration) and runs before any pty spawns; on failure the pty never spawns, `Thread.status='stopped'` persists, and exactly one `system` event/Message carries the failure reason. Raw pty bytes reach the frontend only via: pty → per-thread `@xterm/headless` buffer → line classifier → typed WS event — no other module pattern-matches raw bytes. WS frames are `{ type, threadId, payload, ts }`; events this story emits: `message.delta`, `message.complete`, `status`, `system`. `Message` schema supports all four `kind` values (`text|tool-card|subagent-card|system`) now even though this story only writes `text`/`system`. Content streams and status changes announce via the thread's `aria-live="polite"` region. Registry only creates-if-absent/looks up actors — never kills a pty or reaches into actor state.

**Never:** No `tool-card`/`subagent-card` classification or rendering (Story 1.5). No `stop-turn` or `open-in-terminal` command handling (Stories 1.6/1.10) — the WS envelope's command vocabulary may reserve the names but no handler exists yet. No reconnect/resume-in-flight-stream handling (Story 1.9) — a client that reconnects mid-stream re-fetches history via REST and waits for the next `message.complete`. No cross-project or shared pty (one pty per thread, `Thread.projectId` scoped). Never trust a client-supplied cwd — only `activateProject()`'s resolved path.

**Persona invocation (decided):** `ThreadActor` spawns plain `claude` (no flags) in the `activateProject()`-resolved cwd. On the pty's first spawn for a thread, before delivering the user's actual message, it writes `/{agentSkillId}\n` (e.g. `/bmad-agent-analyst`) as the first pty input line — mirroring this tool's own `/<skill-name>` slash-command convention, since `Persona.agentSkillId` already equals the installed skill's name. Subsequent messages on an already-live pty skip this and write the user's text directly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First message, no pty yet | Composer submit on an idle thread with no live `ThreadActor` | `activateProject()` runs, pty spawns, persona skill is invoked, user message is delivered, `status` event `working` broadcasts | If `activateProject()` throws: no pty spawn, `Thread.status='stopped'` persisted, one `system` Message + WS event with the failure reason |
| Follow-up message, pty alive | Composer submit on a thread whose `ThreadActor` already has a live pty | Message written directly to existing pty stdin, no re-activation, no re-spawn | N/A |
| Pty produces output | Raw bytes arrive on an open pty | Bytes feed the thread's `@xterm/headless` buffer; classifier emits `message.delta` events from rendered text | N/A |
| Turn finishes | Classifier detects the CLI returned to its idle prompt | `message.complete` WS event fires, the `Message` row is persisted (`kind='text'`), `status` returns to `idle` | N/A |
| Pty crashes mid-turn | node-pty emits an unexpected exit | Actor kills its own state, persists `status='stopped'`, emits one `system` event/Message, then deregisters itself | Registry never force-kills; the crash path is fully actor-owned |
| Idle timeout | No WS subscriber and no in-flight turn for 30 min | Actor kills its pty, persists `status='stopped'`, emits a `system` event, deregisters | Next message respawns via the normal first-message path |
| Persona removed, thread pre-existing | Composer submit on a thread whose persona is `status='removed'` | Composer is already disabled per Story 1.3 — no new send path needed | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- add `node-pty@1.1.0`, `@xterm/headless@6.0.0`, `ws@8.21.3`, `@types/ws` (exact-pinned, matching this repo's existing convention of no caret ranges)
- `server.ts` -- attach a `ws.WebSocketServer` to the existing `http.Server`'s `upgrade` event (currently only wires Next's request handler, `server.ts:25-36`); route by URL path to the per-thread channel vs. the shared `presence` channel
- `src/ws/server.ts` (new) -- WS connection handling: parses `{ type, threadId, payload, ts }` frames, dispatches `send-message` commands to the right `ThreadActor` via the registry, forwards actor-emitted events to subscribed sockets
- `src/ws/presence.ts` (new) -- lightweight `{threadId, status}` broadcast channel, no pty spawn
- `src/pty/activateProject.ts` (new) -- cwd/symlink/`.git/info/exclude` activation per AD-2; returns a discriminated result (`{ok:true,cwd}` / `{ok:false,reason}`) mirroring `src/lib/projects.ts`'s `createProject` validation-result shape (`src/lib/projects.ts:61-93`)
- `src/pty/spawn.ts` (new) -- node-pty spawn wrapper; only `ThreadActor` calls this, never a route or component
- `src/parsing/terminal-buffer.ts` (new) -- per-thread `@xterm/headless` buffer wrapper, exposes rendered/de-flickered lines
- `src/parsing/classifier.ts` (new) -- line classifier; this story's ruleset only distinguishes `message` / `status` / `system` (no tool-card/subagent-card patterns yet, per Boundaries)
- `src/actors/ThreadActor.ts` (new) -- mailbox (`send-message` command in this story), pty ownership, idle-reap timer, crash handling, event emission to WS + persistence, per AD-1
- `src/actors/registry.ts` (new) -- `threadId -> ThreadActor` map; create-if-absent on first `send-message`, actor-initiated deregistration only
- `src/persistence/schema.ts` -- add `messages` table: `id TEXT PRIMARY KEY`, `thread_id TEXT NOT NULL REFERENCES threads(id)`, `speaker_persona_id TEXT REFERENCES personas(agent_skill_id)` (nullable = the user), `kind TEXT NOT NULL CHECK (kind IN ('text','tool-card','subagent-card','system'))`, `parent_message_id TEXT REFERENCES messages(id)` (nullable), `content TEXT NOT NULL`, `created_at TEXT NOT NULL`
- `src/persistence/messages-repo.ts` (new) -- `MessagesRepo`: copy `threads-repo.ts`'s class/mapper/`SELECT_COLUMNS` pattern (`src/persistence/threads-repo.ts:1-86`); `create(threadId, kind, content, speakerPersonaId?, parentMessageId?)`, `listByThread(threadId, {before?, limit})`
- `src/lib/db.ts` -- add `messagesRepo` export (same singleton pattern, `src/lib/db.ts:38-40`)
- `src/app/api/threads/[id]/messages/route.ts` (new) -- `GET` paginated history (`?before=<messageId>&limit=50`), `runtime = 'nodejs'`, same validation/error shape as `src/app/api/projects/[id]/threads/route.ts:1-68`
- `src/api/client.ts` -- add `fetchMessages(threadId, before?)`; WS connection is opened directly from the component/state layer, not this REST client
- `src/api/types.ts` -- add `Message`, `MessageKind` types (duplicate-not-import pattern per `ThreadStatus`, `src/api/types.ts:33`)
- `src/state/thread-socket.ts` (new) -- WS connection lifecycle keyed on `thread?.id` (mirrors the REST-fetch effect already in `src/app/page.tsx:42-59`), exposes live messages/status via `useSyncExternalStore`
- `src/components/message-list.tsx` (new) -- renders persisted + streaming messages as bubbles (persona avatar/name, `rounded.md`, `surface-raised`) and `system` lines (no chrome, `text-muted`), per DESIGN.md tokens already in `src/app/globals.css:5-30`
- `src/components/composer.tsx` (new) -- text input, Enter sends / Shift+Enter newline, disabled when persona `removed` (existing disabled-state convention from Story 1.3)
- `src/app/page.tsx` -- replace the "No messages yet." placeholder (`src/app/page.tsx:95-105`) with `MessageList` + `Composer`, wire the WS state hook
- `src/persistence/messages-repo.spec.ts` (new) -- copy `threads-repo.spec.ts`'s `:memory:` db + `makeRepos()` pattern (`src/persistence/threads-repo.spec.ts:1-79`)

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `node-pty`, `@xterm/headless`, `ws`, `@types/ws` -- required stack deps, none installed yet
- [x] `src/persistence/schema.ts` -- add `messages` table -- persistence for text/system turns (and future tool/subagent rows)
- [x] `src/persistence/messages-repo.ts` + `.spec.ts` -- new repo -- read/write path for `Message` rows
- [x] `src/pty/activateProject.ts` -- cwd + `_bmad` symlink overlay + `.git/info/exclude` registration -- AD-2, only path a pty's cwd is established
- [x] `src/pty/spawn.ts` -- node-pty wrapper spawning `claude` in the activated cwd, writing the `/{agentSkillId}` invocation line on first spawn -- isolates the one real subprocess boundary
- [x] `src/parsing/terminal-buffer.ts` -- `@xterm/headless` wrapper -- de-flickered rendered-line source for the classifier
- [x] `src/parsing/classifier.ts` -- line classifier (message/status/system rules only) -- AD-3, single chat-semantics authority
- [x] `src/actors/registry.ts` -- `threadId -> ThreadActor` map -- create-if-absent, actor-initiated deregistration only
- [x] `src/actors/ThreadActor.ts` -- mailbox, pty lifecycle, idle-reap (30 min), crash handling, event emission -- AD-1
- [x] `src/ws/server.ts` -- WS upgrade handling, envelope parse/dispatch -- live transport for an open thread
- [x] `src/ws/presence.ts` -- `{threadId, status}` broadcast, no pty spawn -- Consistency Conventions presence channel
- [x] `server.ts` -- attach `WebSocketServer` to the existing `http.Server` -- only place `upgrade` can be wired
- [x] `src/app/api/threads/[id]/messages/route.ts` -- paginated `GET` -- REST bootstrap before WS open
- [x] `src/api/client.ts`, `src/api/types.ts` -- `fetchMessages`, `Message`/`MessageKind` -- client surface for the new endpoint
- [x] `src/state/thread-socket.ts` -- WS lifecycle + live state -- keeps components decoupled from raw WS handling
- [x] `src/components/message-list.tsx`, `src/components/composer.tsx` -- new UI -- replaces the placeholder thread panel
- [x] `src/app/page.tsx` -- wire `MessageList`/`Composer`/`thread-socket` into the existing layout -- completes the DM send/receive path

**Acceptance Criteria:**
- Given an idle thread with no live pty, when I send my first message, then `activateProject()` runs before any pty spawns, verifying/setting cwd to the real checkout and ensuring the `_bmad` overlay symlinks exist and are excluded via `.git/info/exclude`.
- Given activation succeeds, when the `ThreadActor` spawns its pty, then exactly one long-lived CLI pty exists for this thread and stays alive across turns while idle.
- Given the pty produces output, when raw bytes arrive, then they feed this thread's `@xterm/headless` buffer and only its rendered, de-flickered text reaches the line classifier — no other path pattern-matches raw bytes.
- Given the classifier emits a message event, when the frontend receives it over WS, then it renders as a streaming bubble with persona avatar/name, and the frame matches `{ type, threadId, payload, ts }`.
- Given content streams or status changes, when it updates, then the thread's `aria-live="polite"` region announces it.
- Given `message.complete` arrives, when it's received, then the bubble stops streaming and is persisted as a `Message` row.
- Given `activateProject()` throws, when the pty would have spawned, then it never spawns, `status=stopped` is persisted on the `Thread` row, and exactly one `system` event carries the failure reason.
- Given a `ThreadActor`'s pty is idle with no subscriber and no in-flight turn for the idle window (30 min), when the window elapses, then it kills its own pty, persists `status=stopped`, emits a `system` event, then deregisters itself.

## Implementation Notes

- `ThreadsRepo` gained `findById()` and `updateStatus()` (not in the original Code Map) — needed by `ThreadActor` and the new messages route; follows the existing repo pattern exactly.
- `MessagesRepo.listByThread()` orders by `rowid` (insertion order) rather than `created_at` alone, since two messages created in the same millisecond would otherwise tie and make `before=`-pagination non-deterministic.
- Fixed a real race in `useThreadSocket`: the WS store was originally created inside a `useEffect`, which raced `useSyncExternalStore`'s own subscription and could permanently miss the first updates on mount. Fixed by creating the store synchronously via `useMemo`.
- `ThreadActor.reapIdle()`/crash handling needed a `killingIntentionally` guard: node-pty's `onExit` still fires (asynchronously) after a self-initiated `pty.kill()`, which without the guard double-reported the same teardown through both the idle-reap path and the crash-handling path.
- A follow-up fix closed a gap found during Tasks/AC verification: the AC "content streams or status changes... announce via `aria-live=\"polite\"`" was only half-met — `useThreadSocket`'s `status` was tracked but never rendered. `MessageList` now renders a small status line ("Idle"/"Working…"/"Needs input"/"Stopped") inside its `aria-live` region so status transitions are actually announced, not just tracked in state.
- **Risk, not fully verified end-to-end:** this sandbox's process-exec restrictions block `node-pty.spawn()` entirely (`posix_spawnp failed`, confirmed environment-level, not app code) — the real `claude` pty spawn, persona slash-command invocation, and classifier behavior against real CLI output were never exercised live. Activation (symlink + `.git/info/exclude`), WS plumbing, and user-message persistence/broadcast were verified live against a real temp git checkout. The classifier's heuristics (spinner glyphs, idle-prompt regex, error-line detection in `src/parsing/classifier.ts`) are a best-effort approximation written without a real transcript to validate against — needs a manual run on an unrestricted machine per the spec's "Manual checks" section, with `classifier.ts`'s patterns adjusted if real CLI output differs.
- `terminal-buffer.ts` tracks settled rows as a monotonically increasing absolute row counter; if a single turn's output exceeds the configured scrollback (10,000 lines), xterm's internal scrollback-eviction reindexing could desync it. Unlikely for a chat UI's turn lengths, not addressed.

## Spec Change Log

## Review Triage Log

- `medium` — [blind-hunter, edge-case-hunter, verification-gap] `TerminalBuffer.flush()` (`src/parsing/terminal-buffer.ts`) is defined but `ThreadActor` never calls it (`grep -rn "\.flush()" src` returns nothing) — on a pty crash or idle-reap, no further chunk ever arrives to push the last not-yet-settled row past the cursor, so trailing persona output on that row is silently lost and never classified/persisted; `handleCrash()`/`reapIdle()` also never attempt to persist any lingering `streamingText`. Route: patch.
- `medium` — [verification-gap, pre-verified] The `send-message` WS dispatch path (`attachThreadSocket` in `src/ws/server.ts:28-51`, parsing a frame and calling `actor.sendMessage`) has zero test coverage — confirmed via repo-wide search, no `src/ws/server.spec.ts` or any spec importing `src/ws/server` exists; `ThreadActor.spec.ts` only calls `sendMessage()` directly, never through this dispatch code. Route: patch.
- `medium` — [verification-gap, pre-verified] `ThreadSocketStore.handleFrame()` (`src/state/thread-socket.ts:95-152`) — the client-side `message.delta`/`message.complete`/`system`/`status` handling — has zero test coverage; no spec file exists and nothing else imports `ThreadSocketStore`/`useThreadSocket`. Route: patch.
- `medium` — [blind-hunter] `ThreadSocketStore` (`src/state/thread-socket.ts`) never listens for the WebSocket's `'close'` event, so a dropped connection (server restart, network blip) leaves `connectionError` unset; even the one case that does set it (`'error'`) is never rendered anywhere in the UI — the composer silently no-ops on send with no user-visible feedback. Route: patch.
- `low` — [blind-hunter, edge-case-hunter] `attachThreadSocket` (`src/ws/server.ts`) creates/looks up a `ThreadActor` for any `threadId` in the URL without checking it exists; `ThreadActor.sendMessage()` then throws `"unknown thread ..."`, caught only by a `console.error` in the WS handler with no frame sent to the client — the connection hangs with no feedback. Unreachable in normal use (no delete-thread feature exists to produce a stale id), but the fix is a trivial existence check. Route: patch.
- `low` — [edge-case-hunter] `spawnPty()` (`src/actors/ThreadActor.ts`) never checks whether the thread's persona has `status='removed'` before invoking it — the disabled-composer convention (Story 1.3) is client-side only, so a WS `send-message` frame that bypasses it could still invoke a removed persona's skill. Unlikely in this tool's single-user everyday use, but the fix (reuse `failActivation()`) is trivial. Route: patch.
- `medium` — [edge-case-hunter] `spawnPty()` (`src/actors/ThreadActor.ts`) calls `this.deps.spawnClaude()` with no try/catch; a synchronous throw (e.g. the `claude` binary missing from `PATH` — a plausible first-run failure for this exact tool) propagates uncaught out of `sendMessage()`, is only `console.error`'d by the WS caller, and never reaches the `failActivation()` system-event/`status=stopped` path the spec's AC requires for spawn failures. Route: patch.
- `medium` — [edge-case-hunter] `sendMessage()`/`spawnPty()` (`src/actors/ThreadActor.ts`) have no in-flight-spawn guard: two `sendMessage()` calls arriving before the first call's `activateProject()`/`spawnClaude()` await resolves (e.g. pressing Enter twice quickly on a thread's first message) both see `this.pty === null` and both call `spawnPty()`, spawning two ptys and writing the persona-invocation line twice — contradicts AC2's "exactly one long-lived CLI pty exists for this thread." Route: patch.
- `medium` — [edge-case-hunter] `activateProject()` (`src/pty/activateProject.ts`) requires `.git` to be a directory (`isDirectory(gitDir)`), rejecting a legitimate git worktree or submodule checkout where `.git` is a file containing `gitdir: ...` — a plausible real usage pattern this tool's own users (including this very session's harness) could hit. Route: patch.
- `medium` — [edge-case-hunter] `handleUpgrade()` (`src/ws/server.ts`) calls `decodeURIComponent(threadIdSegment)` unguarded; a malformed percent-encoded WS URL throws a `URIError` synchronously inside the raw `http` `'upgrade'` listener, uncaught — low likelihood in this single-user local tool, but the consequence (a full process crash, taking down every open thread) is severe enough to grade higher despite that. Route: patch.
- `low` — [blind-hunter] `spawnClaude()` (`src/pty/spawn.ts`) casts `process.env` to `Record<string, string>`, unsound since values are typed `string | undefined` — no observed runtime consequence (node-pty tolerates it), but the fix is a trivial `Object.entries` filter. Route: patch.
- `low` — [edge-case-hunter] React Strict Mode (dev only) double-invokes `useMemo`'s factory in `useThreadSocket` (`src/state/thread-socket.ts`), so `new ThreadSocketStore(threadId)` — which opens a `WebSocket` in its constructor — can run twice per mount, leaking one connection. Dev-only (this tool's normal run mode is `pnpm start`, not Strict-Mode `pnpm dev`), and the correct fix (split store construction from connection, moving `connect()` into a `useEffect`) is more than a direct correction. Reject.
- `low` — [blind-hunter] `attachPresenceSocket` (`src/ws/presence.ts`) sends no initial `{threadId, status}` snapshot on connect, only future deltas — but no consumer in this story's diff subscribes to `/ws/presence` at all (presence UI is Story 1.7), so there is no current observable defect. Reject.
- `low` — [blind-hunter] No spec files for `src/ws/presence.ts` (trivial pub/sub, indirectly exercised via `ThreadActor.spec.ts`'s `publishPresence` calls) or for `src/components/composer.tsx`/`message-list.tsx` — matches this codebase's already-established precedent (Story 1.3's review: "no component-test convention exists yet," accepted). Reject.
- `low` — [blind-hunter] No length/size cap on outgoing composer text before it's written to pty stdin / persisted to SQLite — no demonstrated harm (a local single-user SQLite store and a real CLI's stdin both tolerate a large paste without issue); speculative hardening, not an observed defect. Reject.
- `medium` — [edge-case-hunter] `attachThreadSocket` (`src/ws/server.ts`) captures its `ThreadActor` reference once at WS-connection-open time; if that actor later crashes and self-deregisters (`ThreadActor.handleCrash`) while this same connection stays open, a subsequent `sendMessage()` on this connection operates on the stale, deregistered actor instance while a separate new connection for the same `threadId` would get a fresh actor from the registry — two live `ThreadActor` instances (and potentially two ptys) can coexist for one thread, contradicting AD-1's one-actor-per-thread invariant. Verified reachable only via a real pty crash plus a second concurrent connection or fast reconnect (a page reload closes the stale connection via `ws.on('close')`, which unsubscribes it and lets its idle-reap eventually clean it up) — properly closing this requires the WS layer to re-subscribe to whatever actor is current on reconnect, which is bound up with the resume/reconnect handling this story's own Boundaries section explicitly defers to Story 1.9. Defer.
- `false` — [blind-hunter] "`sprint-status.yaml` says `in-progress` while the spec's frontmatter says `in-review` — the two tracking artifacts disagree": refuted as a code defect — this is normal transient state during the review step itself; the sprint-status file syncs to `review` as a standard part of this workflow's own step completion, not something a code patch fixes.

## Design Notes

Message bubble / status-dot / button styling reuses the CSS custom properties already defined in `src/app/globals.css:5-30` (`--surface-raised`, `--text-muted`, `--primary`, `--accent`, `--radius-md`, `--space-3`, `--space-4`) — no new tokens needed. Streaming-text and status-dot transitions must respect `prefers-reduced-motion` (state changes apply immediately, no animation) per EXPERIENCE.md's accessibility floor.

WS URL scheme: attach the thread channel at `/ws/threads/:threadId` and presence at `/ws/presence`, both read off `server.ts`'s single `http.Server` `upgrade` event by matching `req.url`.

Pagination for `GET /api/threads/:id/messages`: `?before=<messageId>&limit=50` (default 50), newest-page-first, mirrors REST conventions already used elsewhere in this codebase (no cursor-token abstraction needed for a single-user local SQLite store).

## Verification

**Commands:**
- `pnpm test` -- expected: all specs pass including new `messages-repo`, classifier, and `activateProject` unit tests
- `pnpm typecheck` -- expected: clean
- `pnpm lint` -- expected: clean

**Manual checks (if no CLI):**
- Open a DM thread for a real registered project, send a message, confirm a real `claude` pty spawns (visible in `ps`), the persona responds in its own voice, and the response corresponds to real execution in that project's checkout (e.g. ask it to read a file and confirm the content is real).
- Kill the dev server mid-turn and confirm no orphaned `claude` process is left running beyond the actor's own crash-handling path (best-effort — full crash-recovery guarantees are inherent to AD-1, not a new test to build here).
