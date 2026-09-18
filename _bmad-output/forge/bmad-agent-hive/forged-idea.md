# Forged idea: BMad chat UI

A chat-app UI for talking to BMad personas across your company's projects — one room per project, each BMad persona (Mary, John, Winston, Amelia, Sally, etc.) a persistent contact you DM, party mode as a group chat room.

## Core decisions

- **Chat skin, not a new agent runtime.** Real BMad-in-Claude-Code execution underneath (Read/Write/Edit/Bash/skills all real). The chat UI renders that as a chat room; it does not reimplement agent execution on a separate stack.
- **Foundation, not a feature.** Correct per-project working-directory/context resolution, and trustworthy memory/artifact/history routing, are invisible plumbing the chat UI depends on — not their own dashboard or screen. Sync/routing state can surface as inline system messages.
- **One room per project**, not one cross-company thread.
- **Each persona is its own persistent contact per project**, not one assistant switching voices.
- **FOSS**, not a sellable product — no paid-tier planning.

## Grounding problem (evidenced, not assumed)

Found in `bmad-hub/docs/rfcs/bmad-hub.md` (self-documented known limitation): Claude Code resolves `@` mentions and relative paths against cwd always. The hub's current activation launches sessions with cwd inside a symlink dir, not the real project checkout — `CLAUDE.md`'s working-directory pointer is a prompt-level instruction that has to be followed every turn, so it fails intermittently. This is the structural source of the "lost `@` shortcuts / wrong-project memory / misrouted artifacts" pain — a plumbing bug, not a visualization gap.

Fix direction: launch with cwd = the real project checkout; overlay BMad's canonical skills/`_bmad` into it via symlinks excluded through `.git/info/exclude` (not a committed `.gitignore`).

## Rejected / killed

- **Munder Difflin's core architecture** (each agent as a separate OS process wrapped via node-pty, file-based mailbox, GOD orchestrator, office-floor visualization) — rejected. BMad personas stay running as skills inside real sessions.
- **Monetization / paid tiers** — out of scope. Confirmed not building a sellable product.
- **A standalone dashboard UI** — killed as its own surface once the chat UI absorbed that job.
- **GitHub sync of artifacts as a requirement** — not a gap; plain git already covers it (bmad-hub already has a GitHub remote).
- **Full custom agent runtime on the Agent SDK, independent of Claude Code** — considered, not chosen. The chat-UI excitement was named directly as being about interface feel, not an unmet capability — so the cheaper "skin over real execution" path was picked over rebuilding the engine.

## Open questions for the next phase (not decided here)

- How bidirectional real-time chat is actually driven: pty-wrapping a real Claude Code process vs. driving sessions via the Claude Agent SDK's structured message stream.
- Final home for this: extending `bmad-hub` in place (shares its project registry, canonical skills, per-project artifacts/memory/docs) vs. a fresh repo. Leaning toward extending `bmad-hub`, not firmly locked — the user asked to design the chat UI fresh/unanchored to bmad-hub's current implementation before this was raised again.
