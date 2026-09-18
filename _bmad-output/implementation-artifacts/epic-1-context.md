# Epic 1 Context: Chat with a BMad Persona

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a user register a real project, open a persistent 1:1 chat with any BMad persona scoped to that project, and watch genuine Claude Code execution (streaming replies, file edits, tool calls, subagent spawns) happen inline — always grounded in the correct project's working directory, with any routing problem surfaced immediately rather than silently. This is the foundational epic: it establishes the actor/pty/classifier pipeline, the project/persona/thread data model, and the core thread UI that Epic 2's party-mode channels build on.

## Stories

- Story 1.1: Add and Switch Between Projects
- Story 1.2: Start a DM with a Persona
- Story 1.3: Send a Message and Get a Real, Grounded Response
- Story 1.4: See Tool Calls and Subagent Work Inline
- Story 1.5: Stop a Running Turn
- Story 1.6: See Persona Status at a Glance
- Story 1.7: Get an Inline Notice When Project Routing Self-Corrects
- Story 1.8: Resume a Conversation After Reopening the App
- Story 1.9: Drop Into a Real Terminal Session
- Story 1.10: Toggle Light/Dark Theme and Settings

## Requirements & Constraints

- Chat is a skin over real execution: every visible persona action (reply, edit, tool call, subagent spawn) must trace back to real Read/Write/Edit/Bash/skill activity in the real project checkout — no separate/simulated execution path, and nothing may synthesize a reply or status change independent of that real process's output.
- Each registered project gets its own isolated room; per-project working-directory and context resolution (cwd, `@`-mentions, relative paths, memory, artifact routing) must be correct on every turn, with any sync/routing problem surfaced inline in the room itself — never a separate dashboard or silent log entry.
- Each persona is a distinct, persistent per-project DM contact (not one assistant switching voices): opening the same persona in the same project always returns the same conversation and history; the same persona in a different project is a separate conversation.
- No paid-tier, billing, or monetization concerns may shape any decision; this is a FOSS, single-user, single-machine hobby tool with no auth surface.
- Directory selection for adding a project must go through a backend-resolved path only — never a client-supplied path or native OS/browser picker.
- Chrome copy (system messages, empty states, button labels) stays plain and factual — no exclamation marks, emoji, or gamified language. Persona message copy stays in that persona's own configured voice and is never flattened.
- Accessibility floor: every icon-only control has an accessible name (`aria-label` or equivalent); new messages and status transitions announce via `aria-live="polite"` on the active thread; focus order is rail → sidebar → thread → composer; Reduce Motion skips streaming-text/status-dot animations.
- Desktop-width layout only for v1 (three columns: project rail, persona/channel list, active thread) — no mobile/responsive requirement.
- Deferred/out of scope for this epic: notification delivery mechanics (permission flow, focus detection — only the state transition/trigger point is in scope), OS-specific open-in-terminal launch mechanism, message-formatting depth (code blocks/diffs/markdown), additional keyboard shortcuts beyond Enter/Shift+Enter, multi-persona process isolation, auth/multi-user.

## Technical Decisions

- **Actor model:** one long-lived `ThreadActor` per open thread owns its pty's full lifecycle — spawns on first open, stays alive across turns while idle, self-enforces idle-reap (default 30 min with no WS subscriber and no in-flight turn) and crash handling. Deregistration is always actor-initiated; the registry only creates-if-absent/looks up actors and never kills a pty or reaches into actor state directly.
- **Project activation** (cwd resolution + `_bmad` symlink overlay + registering those symlinks in that repo's `.git/info/exclude`, never a committed `.gitignore`) is owned by exactly one module, `src/pty/activateProject.ts`, and must run before any pty spawns for a project. No other module spawns a pty directly or invents a fallback. On failure, the pty never spawns, `status=stopped` is persisted on the `Thread` row, and exactly one `system` event carries the failure reason.
- **Render-then-classify pipeline:** raw pty bytes feed a per-thread `@xterm/headless` buffer; only its rendered, de-flickered text reaches a single line classifier that maps lines to `message` / `tool-card` / `subagent-card` / `status` events. No other module re-derives chat semantics from raw bytes.
- **Add-project flow** is backend-driven: a read-only `GET /api/fs/browse?path=...` endpoint backs an in-app breadcrumb browser; only a backend-resolved path is ever written to `Project.path`.
- **Bootstrap vs. live transport:** project list, persona catalog, thread list, and paginated message history load via REST (`GET /api/projects`, `GET /api/projects/:id/threads`, `GET /api/threads/:id/messages`) before a thread's WS connection opens. WS carries only live events/commands for an already-open thread. A separate `presence` WS channel broadcasts `{threadId, status}` deltas for list/tray views without spawning a pty.
- **WS wire envelope:** every frame is `{ type, threadId, payload, ts }`. Events: `message.delta`, `message.complete`, `tool-card.open/update/close`, `subagent-card.open/close`, `status` (`idle|working|needs-input|stopped`), `system`. Commands: `send-message`, `stop-turn`, `open-in-terminal`.
- **Data model:** `Project`; `Persona` (global catalog — `id`, `agentSkillId`, `name` — sourced once from BMad's agent config, never duplicated per project); `Thread` (`kind: dm|channel`, non-nullable `projectId`, unique on `(projectId, personaId)` for `dm`-kind, persisted `status` column written by the owning `ThreadActor`); `ThreadParticipant`; `Message` (`kind: text|tool-card|subagent-card|system`, `speakerPersonaId` nullable for the user, `parentMessageId` nullable, `createdAt`). `id` = nanoid string; timestamps = ISO-8601 UTC.
- A tool-card or subagent-card is minted as a `Message` row at `*.open` time, before its WS event broadcasts; the persisted row and the WS event share the same `parentMessageId`.
- Persona catalog re-syncs on app start, keyed by stable `agentSkillId`. A previously known `agentSkillId` missing from a sync marks that `Persona` `removed` (never deleted, never silently re-matched by display name); any `Thread` tied to it keeps full history but becomes read-only (composer disabled, persona shown as removed).
- Errors always surface as a `system`-kind message in the thread — never a silent log-only failure.
- Stack (pinned at scaffold time): Node.js >=20.19 or >=22.12, TypeScript 5.x, node-pty 1.1.0, @xterm/headless 6.0.0, better-sqlite3 13.0.3, ws 8.21.3, React 19.3.0, Vite 8.3.0. Deployment is a single machine, single process pair (frontend build served by the Node backend, plus the backend itself) — no external hosting, no auth. New package `bmad-room-chat-ui/` with top-level split `src/actors`, `src/pty`, `src/parsing`, `src/persistence`, `src/http`, `src/ws`, `web/`.

## UX & Interaction Patterns

- Design tokens: color pairs (light/dark) for surface-base, surface-raised, text-primary, text-muted, primary, primary-foreground, accent, border, tool-card-bg, tool-card-border; typography roles `body`/`meta`/`display-sm`/`mono`; rounded scale sm 6px/md 10px/lg 14px/full; spacing scale 4/8/12/16/24/32px. Accent green is reserved for "something is happening" (working dot, streaming indicator) — never decorative. No drop shadows; tool cards/system messages differentiate by fill color and hairline border only.
- Theme follows OS/browser `prefers-color-scheme` on first load, then remembers the user's manual toggle; both themes are first-class.
- Project rail: icon-only, fixed, one 40px `{rounded.md}` icon per project, active project gets an `{colors.accent}` left-edge indicator, plus a `+` add-project affordance. Empty state: just the `+` and the copy "No projects yet — add one to start chatting."
- Persona list sidebar: BMad personas as DM contacts scoped to the active project, each with a presence dot (accent = working, muted = idle, distinct badge = needs-input).
- DM thread view: message bubbles (`surface-raised`, `rounded.md`, persona avatar + name in `display-sm` above the bubble), supports streaming text as a response generates.
- Tool card: collapsed by default, `mono` summary line always visible (e.g. `Editing src/api/auth.ts`), chevron expands to full input/output, per-card (not global) expand state, nests inline at the point the call happened.
- Subagent card: same shell as a tool card, one level deeper, independently collapsible, can show its own nested tool cards.
- Stop control: outline `button-stop` style, visible only while a turn is running, single click with no confirmation, disappears once idle; last partial output stays visible marked "Stopped."
- Open-in-terminal control: always available in the thread header regardless of turn state, single click, no confirmation, doesn't discard the chat thread.
- System message: no bubble/card chrome, `meta` typography, `text-muted` color, appears inline at the moment a correction/error happens.
- Settings surface (avatar/gear): theme toggle, notification preference.
- Needs-input state: distinct badge/indicator in persona list and thread header; fires a browser notification if the room isn't focused (mechanics deferred; state transition and trigger point are in scope).
- Interaction primitives: click a rail icon to switch projects; click a persona to open its thread; Enter sends, Shift+Enter inserts a newline; per-card chevron toggles expand/collapse.

## Cross-Story Dependencies

- Story 1.3 (message pipeline: activation → pty spawn → classifier → WS → bubble render/persist) is the backbone every later story in this epic builds on.
- Story 1.4's tool-card/subagent-card behavior is reused unchanged by Epic 2's party-mode channels (nested under each persona's attributed turn).
- Story 1.5's stop control behavior is reused unchanged by Epic 2 (stops the single underlying pty's current turn regardless of which persona is speaking).
- Story 1.7 depends on Story 1.3's activation flow (`activateProject()` failure path) and Story 1.1's `Project`/`Thread` creation.
- Story 1.8's idle-reap and respawn behavior depends on Story 1.3's actor/pty lifecycle (Story 1.5's AD-1 self-enforced idle timer).
- Story 1.6 depends on the `presence` WS channel and `Thread.status` column established for use across all thread list/header views (also reused by Epic 2 channels).
