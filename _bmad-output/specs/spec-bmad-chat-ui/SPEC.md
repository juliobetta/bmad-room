---
id: SPEC-bmad-chat-ui
companions: []
sources: [../../forge/bmad-agent-hive/forged-idea.md]
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# BMad Chat UI

## Why

This is both a mandate to fix and a vision to realize. The mandate: `bmad-hub`'s current activation launches sessions with cwd inside a symlink directory instead of the real project checkout, so Claude Code's `@`-mention and relative-path resolution (which always resolves against cwd) intermittently loses shortcuts, routes memory to the wrong project, and misfiles artifacts — a structural plumbing bug, not a visualization gap, self-documented as a known limitation in `bmad-hub/docs/rfcs/bmad-hub.md`. The vision layered on top: a chat-app interface for talking to BMad personas across a company's projects, so working with Mary, John, Winston, Amelia, Sally, and the rest feels like DMing persistent contacts rather than invoking a CLI. Both matter to anyone currently running BMad through `bmad-hub` across multiple projects.

## Capabilities

- **CAP-1**
  - **intent:** The chat UI renders real BMad-in-Claude-Code execution (Read/Write/Edit/Bash/skills, all real) as a chat room, without reimplementing agent execution on a separate stack.
  - **success:** Actions a persona takes in a chat room (file edits, skill invocations, command runs) are demonstrably the same real operations Claude Code would perform outside the chat UI — no shadow/simulated execution path exists.

- **CAP-2**
  - **intent:** Each project gets its own chat room, with correct per-project working-directory and context resolution handled as invisible plumbing rather than a user-facing feature.
  - **success:** `@`-mentions, relative paths, memory, and artifact routing resolve correctly for the room's project on every turn, with no reliance on a prompt-level instruction to self-correct; any sync/routing hiccup surfaces as an inline system message in the room, not a separate dashboard.

- **CAP-3**
  - **intent:** Each BMad persona (Mary, John, Winston, Amelia, Sally, etc.) is its own persistent contact within a project, not one assistant that switches voices.
  - **success:** A user can open a 1:1 conversation with a named persona in a given project and have that conversation's identity and history persist across sessions, distinct from conversations with other personas in the same project.

- **CAP-4**
  - **intent:** Party mode (multiple personas collaborating) is presented as a group chat room.
  - **success:** A user can start a room containing multiple personas and see each persona's contributions attributed individually within the same thread.

## Constraints

- Chat skin only: real agent execution must stay on Read/Write/Edit/Bash/skills; no separate agent runtime or execution engine may be built underneath the chat UI.
- The plumbing fix is fixed in direction: sessions must launch with cwd set to the real project checkout, with BMad's canonical skills/`_bmad` overlaid via symlinks excluded through `.git/info/exclude` (not a committed `.gitignore`).
- FOSS: no paid-tier or monetization concern may shape a design decision.
- One room per project: cross-project or cross-company single-thread designs are excluded.
- Real-time chat is driven by pty-wrapping the real Claude Code CLI process, not the Agent SDK's structured message stream — this guarantees identical skills/hooks/config/tool behavior to a normal Claude Code session and avoids rebuilding an execution loop independent of Claude Code.
- This project is built here in `bmad-room`, not as an extension of `bmad-hub`.

## Non-goals

- Munder Difflin-style architecture — each agent as a separate OS process wrapped via node-pty, a file-based mailbox, a GOD orchestrator, and an office-floor visualization. Rejected; personas stay running as skills inside real sessions.
- Monetization or paid tiers of any kind.
- A standalone dashboard UI as its own surface — absorbed into the chat UI instead.
- GitHub sync of artifacts as a requirement — plain git already covers this.
- A full custom agent runtime built on the Agent SDK, independent of Claude Code — the appeal here is interface feel, not a missing capability, so the cheaper skin-over-real-execution path was chosen instead.
- Extending `bmad-hub` in place — this project lives in `bmad-room` as its own thing.
- Installing or bootstrapping BMad into a project that doesn't already have `_bmad` — deferred, not addressed by this pass.
- BMad self-update mechanics beyond persona-catalog-drift handling (Persona catalog re-syncs by `agentSkillId`; a missing id is marked `removed`, never deleted or re-matched by name) — deferred, not addressed by this pass.
- Supporting chat harnesses/CLIs other than the real Claude Code CLI (e.g. Antigravity, OpenCode) — contradicts the pty-wrapped-Claude-Code-CLI transport constraint; revisiting this means reopening that transport decision, not adding a story.

## Success signal

A user opens a room for a project, sends a message to a BMad persona, and gets a response grounded in real Claude Code execution for that project (correct cwd, real tool use, real skill invocation) — a working, demonstrable chat conversation with a BMad agent, end to end.
