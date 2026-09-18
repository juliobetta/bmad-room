---
name: BMad Chat UI
status: final
sources:
  - {output_folder}/specs/spec-bmad-chat-ui/SPEC.md
updated: 2026-09-17
---

# BMad Chat UI — Experience Spine

> Local web app (browser UI + local backend daemon). The backend pty-wraps a real Claude Code CLI process per `SPEC.md` CAP-1, so it can also shell out to open a real terminal/Claude Code session directly when the user needs to drop into it. No UI system chosen yet — that's an Architecture decision; `DESIGN.md` tokens are framework-agnostic. Hobby project — single user, single machine, no auth surface.

## Foundation

Desktop-width, single-surface local web app — no mobile/responsive requirement for v1 (see Responsive & Platform). `DESIGN.md` is the visual identity reference; this spine is the experience. Theme follows the OS/browser `prefers-color-scheme` on first load, then remembers the user's manual toggle thereafter — both light and dark are first-class, neither is "the" default.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Project rail | App open | Leftmost icon-only rail, one icon per registered project; switch projects |
| Add project | `+` at bottom of rail | Native folder picker; validates a real project checkout, creates its room |
| Persona list | Select a project | Sidebar listing BMad personas as DM contacts, with presence, scoped to that project |
| DM thread | Select a persona | 1:1 conversation with one persona: greet, work, inline tool/subagent cards, questions, stop control |
| Create channel | `+` above persona list | Describe a task in natural language; personas are auto-selected for the channel |
| Party-mode channel | Select a channel | Group thread with multiple personas, each turn attributed to its speaker |
| Settings | Avatar/gear | Theme toggle, notification preference |

→ Composition reference: `mockups/app-shell-dm-thread.html` (project rail + persona sidebar + active DM thread, light and dark), `mockups/party-mode-channel.html` (group thread with attributed personas). Spine wins on conflict.

## Voice and Tone

Persona copy stays in that persona's configured voice (Mary's treasure-hunter narration, Amelia's terminal-prompt brevity, Winston's measured whiteboard tone, etc. — see `_bmad/config.toml`) — the chat UI does not flatten or standardize it. Chrome copy (system messages, empty states, buttons) stays plain and factual:

| Do | Don't |
|---|---|
| "Editing src/api/auth.ts" | "✨ Amelia is working her magic!" |
| "Routed to the wrong project checkout — resynced." | Silent correction with no trace |
| "No projects yet — add one to start chatting." | "Oops! Nothing here. 😢" |
| Short, factual system copy | Exclamation marks, emoji, gamified language in chrome |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Message bubble | DM + channel threads | One per turn. Persona avatar/name above; supports streaming text as the response generates. |
| Tool card | Inline in a thread | Collapsed by default, summary line always visible (e.g. `Editing src/api/auth.ts`). Expand shows full tool input/output. Nests at the point in the thread the call happened — never floats elsewhere. |
| Subagent card | Inline in a thread | Same shell as a tool card, one level deeper — collapsible, shows the spawned agent's own summary line and its own nested tool cards if it makes its own. |
| Stop control | Thread header, while a turn is running | One click interrupts the current turn. Persona's last partial output stays visible, marked as stopped. Disappears once idle. |
| Open-in-terminal | Thread header, always available | Opens the real Claude Code/terminal session for this project, for when the chat surface isn't enough. |
| System message | Inline in a thread | No bubble/card chrome, `DESIGN.md` `system-message` style. Used for routing/sync status (SPEC.md CAP-2) — appears at the moment a correction happens, not buried in a log. |
| Channel composer | Create channel | Single text field: "What do you want to work on?" Submits → personas auto-selected → channel opens already in progress. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| No projects yet | Project rail | Empty rail with just the `+` add-project affordance and the copy above. |
| Persona idle | Persona list, thread header | Muted status dot, no "working" copy. |
| Persona working | Persona list, thread header | Accent status dot, thread shows streaming response and/or open tool cards. |
| Persona needs input | Persona list, thread header, browser notification | Distinct badge/indicator; if the room isn't focused, a browser notification fires. |
| Turn stopped by user | Thread | Last partial message stays, marked "Stopped" — never silently discarded. |
| Subagent spawned | Thread | Nested subagent card appears at the point of spawn, independently collapsible from its parent tool card. |
| Routing/sync correction | Thread | Inline system message at the moment it happens (SPEC.md CAP-2) — never a separate dashboard. |
| Channel being created | Create-channel flow | Brief "selecting the right people..." state between submit and the channel opening with personas already assigned. |

## Interaction Primitives

- Click a project-rail icon to switch projects; click a persona or channel in the sidebar to open its thread.
- Enter sends a message; Shift+Enter inserts a newline (deferred to iteration for anything beyond this baseline — see note below).
- Click a tool/subagent card's chevron to expand/collapse; state is per-card, not global.
- Stop control is a single explicit click — no confirmation dialog, since the partial output is preserved either way.
- Open-in-terminal is a single click; no in-app confirmation, since it doesn't discard anything.

*Content density, additional keyboard shortcuts, and message-formatting details (code blocks, diffs, markdown) are intentionally left open — the user expects to iterate on these directly rather than lock them now.*

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md`.

- Every icon-only control (project-rail icons, stop button, open-in-terminal, tool-card chevron) carries an accessible name via `aria-label` or equivalent tooltip text.
- New messages and status changes (idle → working → needs-input) announce via an `aria-live="polite"` region on the active thread.
- Focus traversal follows reading order: rail → sidebar → thread → composer.
- Reduce Motion: skip any streaming-text or status-dot transition animation; state changes apply immediately.

## Responsive & Platform

Desktop-width web app only for v1 — this is a local dev tool run on the same machine as the project checkouts it talks to, not a general consumer surface. No mobile layout, no touch-specific interactions are in scope.

## Inspiration & Anti-patterns

- **Lifted from Slack:** the workspace-switcher rail becomes the project rail; the DM list becomes the persona list; creating a channel and having it staffed automatically mirrors how Claude Code already auto-selects subagents for a task.
- **Rejected — native desktop packaging (Electron/Tauri):** the local backend already needs to run natively to pty-wrap Claude Code, so a browser UI gets the same capability without the extra packaging layer.
- **Rejected — office-floor/avatar visualization (per SPEC.md non-goals):** this stays a chat app, not a simulated workplace.

## Key Flows

### Flow 1 — Working an issue with Amelia (Betta, mid-morning, a specific GitHub issue)

→ See `mockups/app-shell-dm-thread.html` for this flow's canonical screen.

1. Betta opens the app; the project he's working in is already the active rail icon from last session.
2. He clicks Amelia in the persona list — her thread opens, idle.
3. He describes the issue in the composer and sends.
4. Amelia's status dot turns to "working"; she posts a short greeting-style acknowledgment, then a tool card appears (`Editing src/api/auth.ts`) as she investigates.
5. She spawns a subagent to check a related test file; a nested subagent card appears under her tool card, collapsed by default.
6. She finds the root cause and asks Betta a clarifying question (AbortController vs. guard) — the stop control disappears since she's now waiting on him, not working.
7. **Climax:** Betta answers inline in the thread, exactly like a real conversation — no separate approval screen, no context switch needed to see what she found.

Failure: if Betta needs to intervene directly, he clicks open-in-terminal and drops into the real Claude Code session for that project without losing the chat thread.

### Flow 2 — Starting a party-mode channel (Betta, a cross-cutting task)

→ See `mockups/party-mode-channel.html` for this flow's canonical screen.

1. Betta clicks `+` above the persona list.
2. He types a one-line description of the task in the channel composer and submits.
3. Brief "selecting the right people..." state, then the channel opens with the auto-selected personas already present.
4. Each persona's contribution is attributed individually as they work, same thread.
5. **Climax:** Betta sees a synthesized outcome in the channel without having had to manually decide who should be in the room.
