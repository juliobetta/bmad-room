# Epic 1 Context: Chat with a BMad Persona

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Users can register a real project, open a persistent 1:1 chat with any BMad persona scoped to that project, and watch real Claude Code execution (file edits, tool calls, subagent spawns) happen inline — always grounded in the correct project's working directory, with routing problems surfaced immediately rather than silently. This epic is the foundation: it stands up the actor/pty/persistence substrate, the REST+WS transport, and the core DM thread experience that party-mode channels (Epic 2) build on.

## Stories

- Story 1.1: Add and Switch Between Projects
- Story 1.2: Migrate to the pnpm + Next.js + Biome + Tailwind + Vitest Stack
- Story 1.3: Start a DM with a Persona
- Story 1.4: Send a Message and Get a Real, Grounded Response
- Story 1.5: See Tool Calls and Subagent Work Inline
- Story 1.6: Stop a Running Turn
- Story 1.7: See Persona Status at a Glance
- Story 1.8: Get an Inline Notice When Project Routing Self-Corrects
- Story 1.9: Resume a Conversation After Reopening the App
- Story 1.10: Drop Into a Real Terminal Session
- Story 1.11: Toggle Light/Dark Theme and Settings

## Requirements & Constraints

- Chat is a skin over real execution: every persona action a user sees must trace back to output read from that thread's real pty-wrapped Claude Code CLI process — no simulated/shadow reply, tool-card, or status change may be synthesized independently of that stream.
- Each registered project gets correct, invisible cwd/context resolution on every turn (so `@`-mentions, relative paths, memory, and artifact routing land in the right checkout); any routing/sync hiccup must surface inline in the thread, never only in a log or separate dashboard.
- Each BMad persona is a persistent, separate contact per project — not one assistant switching voices. Opening the same persona in a different project is a distinct conversation; the same persona in the same project always reopens the same conversation and history.
- No paid-tier/billing/entitlement concern may shape any decision; this is a hobby, single-user, single-machine local tool with no auth surface and no mobile/responsive requirement.
- No `Thread` spans more than one project (no cross-project or cross-company single-thread views) — a project can have many threads (one per persona DM, plus channels), but never one thread shared across projects; any cross-project display (e.g. a notification tray) reads existing thread state for display only and never opens its own live subscription.
- Accessibility floor: accessible name on every icon-only control; `aria-live="polite"` announcements for new messages/status changes; focus order rail → sidebar → thread → composer; Reduce Motion skips streaming/status-dot transitions.
- Chrome copy (system messages, empty states, buttons) is plain and factual, no exclamation marks/emoji/gamified language; persona message copy stays in that persona's own configured voice, never flattened.

## Technical Decisions

- **Actor model**: one long-lived `ThreadActor` per open thread owns its pty's full lifecycle — spawns on first open, stays alive across turns while idle, self-enforces an idle-reap timer (default 30 min, no subscriber + no in-flight turn) and crash handling. Deregistration is always actor-initiated; the registry only creates/looks up actors and never kills a pty or reaches into actor state directly.
- **Project activation** (cwd resolution + `_bmad` symlink overlay + registration in that repo's `.git/info/exclude`, never a committed `.gitignore`) is owned by exactly one module (`activateProject`), run before any pty spawns for a project. No other module spawns a pty or invents its own fallback. On failure, the pty never spawns, `status=stopped` persists on the `Thread` row, and exactly one `system` event carries the failure reason.
- **Render-then-classify pipeline**: raw pty bytes feed a per-thread headless terminal buffer; only its rendered, de-flickered text reaches a single line classifier that maps lines to `message` / `tool-card` / `subagent-card` / `status` events. No other module re-derives chat semantics from raw bytes.
- **Transport split**: project list, persona catalog, thread list, and paginated message history load via REST before a thread's WS connection opens; WS carries only live events/commands for an already-open thread. A separate `presence` WS channel broadcasts `{threadId, status}` deltas without spawning a pty. WS envelope: `{ type, threadId, payload, ts }`; events `message.delta/complete`, `tool-card.open/update/close`, `subagent-card.open/close`, `status` (`idle|working|needs-input|stopped`), `system`; commands `send-message`, `stop-turn`, `open-in-terminal`.
- **Data model**: `Project`, `Persona` (global catalog, synced once from BMad's agent config, keyed by stable `agentSkillId` — never duplicated per project), `Thread` (`kind: dm|channel`, non-nullable `projectId`, unique on `(projectId, personaId)` for DMs, persisted `status` column), `ThreadParticipant`, `Message` (`kind: text|tool-card|subagent-card|system`, nullable `parentMessageId`). A tool-card/subagent-card row is minted at `*.open` time, before its WS event broadcasts, sharing `parentMessageId` with that event.
- **Persona catalog drift**: on re-sync, a `Persona` whose `agentSkillId` is no longer found is marked `removed` (never deleted, never re-matched by display name); its threads keep full history but become read-only (composer disabled, shown as removed).
- **Add-project flow** is backend-driven: a read-only directory-listing endpoint backs an in-app breadcrumb browser; only a backend-resolved path is ever written to `Project.path` — no OS/browser native picker.
- **Stack** (as of Story 1.2's migration, supersedes the original Vite/standalone-Node scaffold): pnpm; Next.js App Router as a single process via a custom `server.ts` (so `ws`'s `WebSocketServer` attaches to the same `http.Server` upgrade event Next uses — plain route handlers can't serve raw WS upgrades); TypeScript 5.x; node-pty 1.1.0; @xterm/headless 6.0.0; better-sqlite3 13.0.3 (schema/data untouched by the migration); ws 8.21.3; React 19.3.0; Tailwind CSS (replaces hand-written CSS); Biome (replaces oxlint); Vitest (replaces `node:test`). REST endpoints live under `src/app/api/**/route.ts`.

## UX & Interaction Patterns

- Three-column desktop-only layout: icon-only project rail (40px square icons, accent left-edge indicator on the active project, `+` to add) · persona/channel sidebar (scoped to active project, presence dot per persona: accent = working, muted = idle, distinct badge = needs-input) · active thread (fluid).
- Message bubbles carry persona avatar/name above them and support streaming text as a response generates.
- Tool cards are collapsed by default with an always-visible mono summary line (e.g. `Editing src/api/auth.ts`), nest inline at the point the call happened, and expand per-card via chevron. Subagent cards use the same shell one level deeper, independently collapsible.
- Stop control: outline style, visible only while a turn runs, single click with no confirmation; last partial output stays visible and is marked "Stopped."
- Open-in-terminal: always visible in the thread header, single click, no confirmation, never discards the chat thread.
- System messages (routing/sync corrections, errors) render inline with no bubble/card chrome, muted meta-style text, at the moment they happen.
- Empty state ("no projects yet"): rail shows only the `+` affordance and the copy "No projects yet — add one to start chatting."
- Settings (avatar/gear): theme toggle (defaults to OS `prefers-color-scheme`, then remembers manual choice) and a notification-preference control (underlying permission-flow mechanics are deferred).
- Needs-input state gets a distinct badge in both persona list and thread header; a browser notification fires if the room isn't focused (mechanics deferred, but the trigger point is in scope for this epic).

## Cross-Story Dependencies

- Story 1.2 (stack migration) must preserve Story 1.1's REST/fs-browse contracts unmodified — it re-platforms delivery, not behavior, and all later stories build on the post-migration Next.js/pnpm/Tailwind/Vitest stack.
- Story 1.3 (DM threads) depends on Story 1.1 (an active project) and produces the `Thread` rows that Story 1.4 activates.
- Story 1.4 (real grounded response) depends on Story 1.3's `Thread` existing and introduces `activateProject()` + the `ThreadActor`/pty/classifier pipeline that Stories 1.5–1.9 all render events through.
- Story 1.5 (tool/subagent cards) and Story 1.7 (status at a glance) both consume classifier events introduced in Story 1.4.
- Story 1.6 (stop) and Story 1.10 (open-in-terminal) both require an active thread from Story 1.4.
- Story 1.8 (inline routing notice) depends on the `activateProject()` failure path defined in Story 1.4.
- Story 1.9 (resume/idle-reap) depends on the actor lifecycle established in Story 1.4 and reuses Story 1.1's REST bootstrap for history loading.
- Story 2.1/2.2 in Epic 2 depend on this epic's `ThreadActor`, classifier, and tool-card/subagent-card behavior (Story 1.5) applying unchanged inside party-mode channels.
