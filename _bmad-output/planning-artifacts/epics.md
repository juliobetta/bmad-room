---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/specs/spec-bmad-chat-ui/SPEC.md
  - _bmad-output/planning-artifacts/architecture/architecture-bmad-room-2026-09-18/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-room-2026-09-17/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-room-2026-09-17/EXPERIENCE.md
---

# BMad Chat UI - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for BMad Chat UI, decomposing the requirements from SPEC.md (used as the PRD substitute — this project ran `bmad-spec` rather than `bmad-prd`), the UX design contract (DESIGN.md + EXPERIENCE.md), and the Architecture spine into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The chat UI renders real BMad-in-Claude-Code execution (Read/Write/Edit/Bash/skills, all real) as a chat room, without reimplementing agent execution on a separate stack. Actions a persona takes in a chat room are demonstrably the same real operations Claude Code would perform outside the chat UI — no shadow/simulated execution path.

FR2: Each project gets its own chat room, with correct per-project working-directory and context resolution handled as invisible plumbing. `@`-mentions, relative paths, memory, and artifact routing resolve correctly for the room's project on every turn; any sync/routing hiccup surfaces as an inline system message in the room, never a separate dashboard.

FR3: Each BMad persona (Mary, John, Winston, Amelia, Sally, etc.) is its own persistent contact within a project, not one assistant that switches voices. A user can open a 1:1 conversation with a named persona in a given project and have that conversation's identity and history persist across sessions, distinct from other personas in the same project.

FR4: Party mode (multiple personas collaborating) is presented as a group chat room. A user can start a room containing multiple personas and see each persona's contributions attributed individually within the same thread.

### NonFunctional Requirements

NFR1: Chat skin only — real agent execution must stay on Read/Write/Edit/Bash/skills; no separate agent runtime or execution engine may be built underneath the chat UI.

NFR2: Sessions must launch with cwd set to the real project checkout; BMad's canonical skills/`_bmad` are overlaid via symlinks excluded through `.git/info/exclude` (never a committed `.gitignore`) — this is the fix for the historical `@`-mention/misrouted-artifact bug.

NFR3: FOSS — no paid-tier or monetization concern may shape any design decision; no billing/entitlement seed anywhere in the build.

NFR4: One room per project — cross-project or cross-company single-thread designs are excluded; any cross-project view (e.g. a notification tray) reads across rows for display only, never as its own live thread.

NFR5: Real-time chat is driven by pty-wrapping the real Claude Code CLI process, not the Agent SDK's structured message stream — guarantees identical skills/hooks/config/tool behavior to a normal Claude Code session.

NFR6: This project is built in `bmad-room` itself, not as an extension of `bmad-hub`.

### Additional Requirements

- Actor model: one long-lived `ThreadActor` per open thread; the actor owns its pty's full lifecycle (spawn on first open, idle-reap after a configurable window, default 30 min, with no open WS subscriber and no in-flight turn). Deregistration is always actor-initiated; the registry never kills a pty or reaches into an actor's state (AD-1).
- Project activation (cwd resolution + `_bmad` symlink overlay + `.git/info/exclude` registration) is owned by exactly one module, `src/pty/activateProject.ts`, run before any pty spawns for a project; no other module spawns a pty directly or invents its own fallback (AD-2).
- Raw pty bytes become chat events only through a per-thread `@xterm/headless` buffer feeding a single line classifier that maps rendered lines to `message` / `tool-card` / `subagent-card` / `status` events; no other module re-derives chat semantics from raw bytes (AD-3).
- Party-mode channels stay single-process: one `ThreadActor`, one pty, invoking `bmad-party-mode` in its default `session` mode; per-persona attribution comes from the classifier recognizing that skill's own turn markers, never from spawning one pty per persona (AD-4).
- Add-project directory selection is backend-driven: a read-only `GET /api/fs/browse?path=...` endpoint backs an in-app breadcrumb browser; only a backend-resolved path is ever written to `Project.path` (AD-7) — no OS/browser native picker.
- Bootstrap vs. live transport split: project list, persona catalog, thread list, and paginated message history are fetched via REST (`GET /api/projects`, `GET /api/projects/:id/threads`, `GET /api/threads/:id/messages`) before opening a thread's WS connection. WS carries only live events/commands for an already-open thread. A separate `presence` WS channel broadcasts `{threadId, status}` deltas for list/tray views without triggering a pty spawn.
- WS wire envelope: every frame is `{ type, threadId, payload, ts }`. Events: `message.delta`, `message.complete`, `tool-card.open/update/close`, `subagent-card.open/close`, `status` (`idle|working|needs-input|stopped`), `system`. Commands: `send-message`, `stop-turn`, `open-in-terminal`.
- Data model: `Project`, `Persona` (global catalog, sourced once from BMad's agent config, never duplicated per project), `Thread` (`kind: dm|channel`, non-nullable `projectId`, unique on `(projectId, personaId)` for `dm`-kind), `ThreadParticipant`, `Message` (`kind: text|tool-card|subagent-card|system`, `parentMessageId` nullable, persisted `Thread.status` column written by the owning `ThreadActor`).
- Tool-card/subagent-card rows are minted as a `Message` row at `*.open` time, before the WS event broadcasts; the persisted row and the WS event share the same `parentMessageId`.
- Errors surface as a `system`-kind message in the thread, never a silent log-only failure.
- Stack (pin at scaffold time; revised by Story 1.2): Node.js >=20.19 or >=22.12; TypeScript 5.x; pnpm; Next.js (App Router, re-resolve latest at scaffold time); node-pty 1.1.0; @xterm/headless 6.0.0; better-sqlite3 13.0.3; ws 8.21.3; React 19.3.0; Tailwind CSS; Biome; Vitest.
- Deployment: single machine, single Next.js process (`pnpm dev` / `next start`) via a custom server (`server.ts`) — App Router route handlers alone cannot serve raw WebSocket upgrades, so `ws`'s `WebSocketServer` attaches to the same `http.Server`'s `upgrade` event that Next's request handler uses. No external hosting, no auth/multi-user.
- New package `bmad-room-chat-ui/` lives alongside this repo's existing `_bmad` tooling, with `src/actors`, `src/pty`, `src/parsing`, `src/persistence`, `src/ws`, and `src/app` (Next.js App Router, including `src/app/api/**/route.ts` for what was `src/http/`) as the top-level module split.
- Deferred (explicitly out of scope for story-writing in this pass): notification delivery mechanics (browser `Notification` permission flow, focus detection), open-in-terminal OS-specific launch mechanism, message-formatting depth (code blocks/diffs/markdown) and additional keyboard shortcuts, multi-persona process isolation (agent-team party mode), auth/multi-user.
- Persona catalog drift handling (gap surfaced during story creation, not in the original Architecture spine): the `Persona` catalog re-syncs on app start, keyed by stable `agentSkillId`. If a previously known `agentSkillId` is missing from the current sync, that `Persona` is marked `removed` rather than deleted — any `Thread` tied to it keeps its full message history and becomes read-only (composer disabled, persona shown as removed in the list); nothing is ever silently reassigned to a different agent by display-name matching.

### UX Design Requirements

UX-DR1: Implement the full design-token set from DESIGN.md — color tokens (light + dark pairs for surface-base, surface-raised, text-primary, text-muted, primary, primary-foreground, accent, border, tool-card-bg, tool-card-border), typography roles (`body`, `meta`, `display-sm`, `mono`), rounded scale (`sm` 6px / `md` 10px / `lg` 14px / `full`), and spacing scale (4/8/12/16/24/32px).

UX-DR2: Theme follows OS/browser `prefers-color-scheme` on first load, then remembers the user's manual toggle thereafter; both light and dark are first-class.

UX-DR3: Build the project rail — icon-only, fixed, one icon per registered project, 40px square `{rounded.md}`, active project gets an `{colors.accent}` left-edge indicator; includes a `+` add-project affordance.

UX-DR4: Build the add-project flow as an in-app breadcrumb directory browser (per AD-7, backed by `GET /api/fs/browse`), not a native OS/browser picker; validates a real project checkout and creates its room.

UX-DR5: Build the persona list sidebar — BMad personas as DM contacts scoped to the active project, each with a presence/status dot (`{colors.accent}` working, `{colors.text-muted}` idle, distinct badge for needs-input).

UX-DR6: Build the DM thread view — message bubbles (`{colors.surface-raised}`, `{rounded.md}`, persona avatar + name in `{typography.display-sm}` above the bubble), supporting streaming text as a response generates.

UX-DR7: Build the tool card component — collapsed by default, `{typography.mono}` summary line always visible (e.g. `Editing src/api/auth.ts`), chevron expands full input/output, per-card expand/collapse state, nests inline at the point the call happened.

UX-DR8: Build the subagent card component — same shell as a tool card, one level deeper, independently collapsible, showing its own nested tool cards if any.

UX-DR9: Build the stop control — outline style (`button-stop`), appears only while a turn is running, single click with no confirmation dialog, disappears once idle; the persona's last partial output stays visible and is marked "Stopped."

UX-DR10: Build the open-in-terminal control — always available in the thread header, single click with no confirmation, opens the real Claude Code/terminal session for that project without discarding the chat thread.

UX-DR11: Build the system message component — no bubble/card chrome, `{typography.meta}` / `{colors.text-muted}`, appears inline at the moment a routing/sync correction or error happens (never buried in a log, never a separate dashboard).

UX-DR12: Build the create-channel flow — single text field ("What do you want to work on?"), submits into a brief "selecting the right people..." transitional state, then opens the channel with personas already auto-selected and present.

UX-DR13: Build the party-mode channel thread — group thread with multiple personas, each turn attributed individually to its speaker via the classifier's turn-marker recognition (no per-persona pty).

UX-DR14: Build the settings surface (avatar/gear) — theme toggle, notification preference.

UX-DR15: Implement the needs-input state end-to-end — distinct badge/indicator in persona list and thread header; if the room isn't focused, fire a browser notification (mechanics deferred, but the state transition and trigger point are in scope).

UX-DR16: Implement the empty state for "no projects yet" — empty rail with just the `+` add-project affordance and the copy "No projects yet — add one to start chatting."

UX-DR17: Implement the accessibility floor — `aria-label`/equivalent tooltip on every icon-only control (project-rail icons, stop button, open-in-terminal, tool-card chevron); `aria-live="polite"` region for new messages and status changes on the active thread; focus traversal rail → sidebar → thread → composer; Reduce Motion skips streaming-text/status-dot transition animations.

UX-DR18: Implement baseline interaction primitives — click a project-rail icon to switch projects; click a persona/channel to open its thread; Enter sends a message, Shift+Enter inserts a newline; per-card chevron expand/collapse.

UX-DR19: Chrome copy (system messages, empty states, buttons) stays plain and factual per the Voice and Tone table (no exclamation marks, emoji, or gamified language); persona message copy stays in that persona's own configured voice, never flattened.

UX-DR20: Desktop-width layout only for v1 — three-column layout (project rail · persona/channel list · active thread); no mobile/responsive requirement in scope.

### FR Coverage Map

FR1: Epic 1 - real execution, no shadow path
FR2: Epic 1 - per-project cwd/context plumbing
FR3: Epic 1 - persona as persistent per-project DM contact
FR4: Epic 2 - party mode as group chat

## Epic List

### Epic 1: Chat with a BMad Persona
Users can register a project, open a persistent 1:1 chat with any BMad persona in that project, and see real Claude Code execution (file edits, tool calls, subagent spawns) happen inline — grounded in the correct project's cwd every time.
**FRs covered:** FR1, FR2, FR3

### Epic 2: Collaborate in Party-Mode Channels
Users can describe a task in natural language and get a group chat channel where multiple BMad personas collaborate, each turn clearly attributed to its speaker.
**FRs covered:** FR4

## Epic 1: Chat with a BMad Persona

Users can register a project, open a persistent 1:1 chat with any BMad persona in that project, and see real Claude Code execution (file edits, tool calls, subagent spawns) happen inline — grounded in the correct project's cwd every time.

### Story 1.1: Add and Switch Between Projects

As a user,
I want to register a project by picking its real folder and see it appear in the project rail,
So that I can start chatting with BMad personas grounded in that project's actual checkout.

**Acceptance Criteria:**

**Given** no projects have been added yet
**When** I open the app
**Then** I see an empty project rail with only the "+" add-project affordance
**And** the copy "No projects yet — add one to start chatting." is shown

**Given** I click "+" on the project rail
**When** the breadcrumb directory browser opens
**Then** it lists directories returned by `GET /api/fs/browse`
**And** no client-supplied path is ever trusted directly — only a backend-resolved path can be selected

**Given** I select a directory and confirm
**When** the backend validates it as a real project checkout
**Then** a `Project` row is created with that backend-resolved path
**And** a new icon appears in the rail

**Given** at least one project exists
**When** I click a different rail icon
**Then** that project becomes active
**And** the persona/channel list updates to its scope

**Given** the selected directory fails validation
**When** validation runs
**Then** an error is shown and no `Project` row is created

### Story 1.2: Migrate to the pnpm + Next.js + Biome + Tailwind + Vitest Stack

As a developer building the chat UI,
I want the app running on pnpm, Next.js (App Router), Biome, Tailwind, and Vitest instead of a standalone Node backend plus a separate Vite frontend,
So that the rest of Epic 1 and Epic 2 build on one consolidated process and consistent tooling, matching the rest of this codebase's conventions.

**Acceptance Criteria:**

**Given** the app is currently split across a standalone Node/`tsx` backend (`src/http/*`) and a separate Vite dev server (`web/`)
**When** the migration is complete
**Then** the app runs as a single Next.js (App Router) process, and `pnpm dev` starts exactly one process, not two

**Given** raw pty bytes must reach the frontend over WebSocket (per AD-3 and the WS wire envelope)
**When** the Next.js process starts
**Then** it runs via a custom server (`server.ts`) so `ws`'s `WebSocketServer` attaches to the same `http.Server`'s `upgrade` event Next's own request handler uses — plain App Router route handlers cannot serve a raw WS upgrade

**Given** Story 1.1's project REST and fs-browse endpoints (`GET /api/fs/browse`, `Project` CRUD)
**When** they're ported to Next.js route handlers (`src/app/api/**/route.ts`)
**Then** their request/response contracts are unchanged and Story 1.1's acceptance criteria still pass unmodified

**Given** the existing SQLite database and `better-sqlite3` schema
**When** the migration runs
**Then** the database file and schema are untouched — only the runtime/process wrapper changes, no data migration

**Given** the project currently uses npm (`package-lock.json`)
**When** dependencies are reinstalled
**Then** pnpm is used exclusively and `package-lock.json` is removed

**Given** the existing hand-written CSS (`App.css`, `index.css`)
**When** the ported components (project rail, add-project breadcrumb browser) are restyled
**Then** Tailwind utility classes replace it with no visual regression to Story 1.1's UI

**Given** the existing `oxlint` config
**When** linting is reconfigured
**Then** Biome replaces it and `pnpm lint` runs clean

**Given** the existing `node:test` suites (`fsBrowse`, `projects`, `projectsRepo`)
**When** they're migrated
**Then** they run under Vitest with equivalent coverage and `pnpm test` passes

### Story 1.3: Start a DM with a Persona

As a user with an active project,
I want to see BMad personas as contacts and open a 1:1 thread with one,
So that I have a persistent, separate conversation per persona.

**Acceptance Criteria:**

**Given** the active project
**When** I open the persona list
**Then** every persona from the global `Persona` catalog appears with an idle status dot

**Given** I click a persona I've never messaged in this project
**When** the thread opens
**Then** a `Thread` row (`kind=dm`, unique on `projectId`+`personaId`) is created if absent
**And** shows an empty/idle state with no pty spawned yet

**Given** I already have a `Thread` with this persona here
**When** I click them again
**Then** the same `Thread` opens, not a new one

**Given** I open the same persona in a different project
**When** the thread opens
**Then** it is a distinct `Thread` (different `projectId`)

**Given** the persona catalog re-syncs (e.g. on app start), keyed by stable `agentSkillId`
**When** a previously known `agentSkillId` is no longer present
**Then** the corresponding `Persona` is marked `removed`, never deleted, and never silently re-matched to a different agent by display name

**Given** a `Persona` is marked `removed`
**When** I view a `Thread` tied to that persona
**Then** the thread and its full message history remain visible, but the composer is disabled and the persona shows as removed in the list

**Given** a `Persona`'s `agentSkillId` still exists after a catalog re-sync
**When** the sync runs
**Then** no change occurs to that `Persona` or its `Thread`s

### Story 1.4: Send a Message and Get a Real, Grounded Response

As a user in a DM thread,
I want to send a message and get a response backed by real Claude Code execution in my project's actual checkout,
So that I can trust every action is real, not simulated.

**Acceptance Criteria:**

**Given** an idle thread with no live pty
**When** I send my first message
**Then** `activateProject()` runs before any pty spawns, verifying/setting cwd to the real checkout and ensuring the `_bmad` overlay symlinks exist and are excluded via `.git/info/exclude`

**Given** activation succeeds
**When** the `ThreadActor` spawns its pty
**Then** exactly one long-lived CLI pty exists for this thread and stays alive across turns while idle

**Given** the pty produces output
**When** raw bytes arrive
**Then** they feed this thread's `@xterm/headless` buffer and only its rendered, de-flickered text reaches the line classifier — no other path pattern-matches raw bytes

**Given** the classifier emits a message event
**When** the frontend receives it over WS
**Then** it renders as a streaming bubble with persona avatar/name in `{typography.display-sm}`, and the frame matches `{ type, threadId, payload, ts }`

**Given** content streams or status changes
**When** it updates
**Then** the thread's `aria-live="polite"` region announces it

**Given** `message.complete` arrives
**When** it's received
**Then** the bubble stops streaming and is persisted as a `Message` row

### Story 1.5: See Tool Calls and Subagent Work Inline

As a user watching a persona work,
I want tool calls and subagent activity shown inline,
So that I can follow real actions without leaving the conversation.

**Acceptance Criteria:**

**Given** a turn invokes a tool
**When** the classifier emits `tool-card.open`
**Then** a `Message` row (`kind=tool-card`) is minted at open time, before the WS event broadcasts, sharing its `parentMessageId`

**Given** a tool card is open
**When** it renders
**Then** it's collapsed by default with its `{typography.mono}` summary line visible, nested at the point the call happened

**Given** a collapsed card
**When** I click its chevron
**Then** it expands to full input/output, with per-card (not global) expand state

**Given** a subagent is spawned
**When** `subagent-card.open` fires
**Then** a nested, independently collapsible subagent card appears under the parent tool card

**Given** a call finishes
**When** `*.close` arrives
**Then** the card reflects completion without losing its content

### Story 1.6: Stop a Running Turn

As a user whose persona is mid-turn,
I want to stop it with one click,
So that I can interrupt work without losing what's been produced.

**Acceptance Criteria:**

**Given** status=working
**When** I view the thread header
**Then** the outline stop control is visible

**Given** the stop control is visible
**When** I click it
**Then** `stop-turn` is sent and the turn interrupts with no confirmation dialog

**Given** a turn is stopped
**When** interruption completes
**Then** the last partial output stays visible, marked "Stopped," and the stop control disappears

**Given** no turn is running
**When** I view the header
**Then** the stop control is not shown

### Story 1.7: See Persona Status at a Glance

As a user with multiple persona threads,
I want to see each one's status without opening it,
So that I know who's idle, working, or waiting on me.

**Acceptance Criteria:**

**Given** an idle `ThreadActor`
**When** I view the list/header
**Then** a muted status dot shows, no "working" copy

**Given** a running turn
**When** I view the list/header
**Then** an accent status dot shows

**Given** a persona asks a clarifying question
**When** status becomes needs-input
**Then** a distinct badge appears in both list and header

**Given** a `presence` WS delta arrives for a thread not open
**When** received
**Then** the list updates that status dot without opening a live per-thread subscription (no pty spawn triggered)

### Story 1.8: Get an Inline Notice When Project Routing Self-Corrects

As a user relying on correct per-project execution,
I want any activation problem surfaced the moment it happens,
So that I never wonder if something landed in the wrong project silently.

**Acceptance Criteria:**

**Given** `activateProject()` throws during pty spawn
**When** the failure occurs
**Then** the pty never spawns, `status=stopped` is persisted on the `Thread` row, and exactly one `system` event carries the failure reason

**Given** a `system` event arrives
**When** it renders
**Then** it appears inline with no bubble/card chrome, `{typography.meta}`/`{colors.text-muted}`, at the point it happened — never in a separate dashboard or log-only

**Given** it's a routing/sync correction
**When** I read it
**Then** the copy is short and factual, never a silent no-trace correction

### Story 1.9: Resume a Conversation After Reopening the App

As a returning user,
I want my prior conversations still there when I come back,
So that I don't lose context between sessions.

**Acceptance Criteria:**

**Given** a thread has prior messages
**When** I reopen the app and select that persona
**Then** history loads via `GET /api/threads/:id/messages` before any WS connection opens

**Given** a `ThreadActor`'s pty is idle with no subscriber and no in-flight turn for the idle window (default 30 min)
**When** the timer fires
**Then** it kills its own pty, persists `status=stopped`, emits a `system` event explaining why, then deregisters itself

**Given** a stopped thread gets a new message
**When** sent
**Then** the actor respawns its pty and relies on Claude Code's own session resume — no manual history rebuild per turn

**Given** multiple actors exist
**When** one idle-reaps or crashes
**Then** no other thread's actor/pty is affected — deregistration is always actor-initiated

### Story 1.10: Drop Into a Real Terminal Session

As a user who needs more control,
I want to open the real Claude Code/terminal session for this project directly,
So that I can intervene without losing my chat thread.

**Acceptance Criteria:**

**Given** an open thread
**When** I view the header
**Then** open-in-terminal is always available, regardless of turn state

**Given** I click it
**When** the command sends
**Then** the real session opens on the local machine with no confirmation dialog

**Given** I return to the chat UI
**When** I check the thread
**Then** nothing was discarded — history and state are unaffected

### Story 1.11: Toggle Light/Dark Theme and Settings

As a user,
I want the app to match my system theme by default and let me override it,
So that the UI stays comfortable regardless of OS setting or personal preference.

**Acceptance Criteria:**

**Given** first open with no stored preference
**When** the app loads
**Then** it follows OS/browser `prefers-color-scheme`

**Given** Settings is open
**When** I toggle theme
**Then** the UI switches immediately between DESIGN.md's light/dark token sets, and the choice persists across future loads

**Given** Settings is open
**When** I view it
**Then** I see the theme toggle and a notification-preference control (underlying browser permission-flow mechanics stay out of scope, per Architecture's Deferred list)

**Given** OS-level Reduce Motion is active
**When** a streaming-text or status-dot transition would animate
**Then** it applies immediately instead

## Epic 2: Collaborate in Party-Mode Channels

Users can describe a task in natural language and get a group chat channel where multiple BMad personas collaborate, each turn clearly attributed to its speaker.

### Story 2.1: Create a Channel from a Task Description

As a user,
I want to describe a task in one line and get a group chat channel staffed automatically,
So that I don't have to manually decide which personas should be involved.

**Acceptance Criteria:**

**Given** I'm in a project
**When** I click "+" above the persona list
**Then** a channel composer opens with a single text field: "What do you want to work on?"

**Given** I type a task description and submit
**When** the request sends
**Then** the UI shows a brief "selecting the right people..." transitional state

**Given** the backend receives the description
**When** it selects personas for the channel
**Then** a `Thread` row (`kind=channel`) is created with those personas as `ThreadParticipant`s, and no per-persona pty exists

**Given** the channel is created
**When** the transitional state ends
**Then** it opens already in progress, with the auto-selected personas visible as participants

**Given** the channel's `ThreadActor` spawns its pty
**When** it starts
**Then** it invokes the `bmad-party-mode` skill in its default `session` mode (not `subagent`/`agent-team`)

### Story 2.2: See Each Persona's Contribution Attributed in the Channel

As a user in a party-mode channel,
I want each persona's turn clearly attributed to who said it,
So that I can follow a multi-persona conversation as easily as a DM.

**Acceptance Criteria:**

**Given** the channel's single pty runs `bmad-party-mode` in `session` mode
**When** a persona speaks
**Then** the classifier recognizes that skill's turn marker (`{icon} **{name}:**`) and attributes the message bubble to that persona, never to a generic "assistant"

**Given** multiple personas contribute in sequence
**When** I read the thread
**Then** each contribution is its own attributed bubble, in the order it occurred

**Given** a persona invokes a tool or spawns a subagent
**When** the classifier emits the event
**Then** Epic 1's tool-card/subagent-card behavior (Story 1.4) applies unchanged, nested under that persona's turn

**Given** the channel is running
**When** I use the stop control
**Then** it stops the single underlying pty's current turn exactly as in a DM (Story 1.5), affecting whichever persona is speaking

**Given** any persona speaks
**When** the channel is active
**Then** no new `ThreadActor` or pty is ever created — one pty serves the whole channel (AD-4)
