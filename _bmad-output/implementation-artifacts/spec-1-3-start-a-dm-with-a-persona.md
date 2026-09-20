---
title: 'Start a DM with a Persona'
type: 'feature'
created: '2026-09-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f91ec649e6b6e1afd0f8b0442f136ea51e583611'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users have no way to see BMad personas as contacts or open a persistent 1:1 conversation with one — the app currently only shows an active-project placeholder after project selection.

**Approach:** Sync the real BMad agent roster from `_bmad/config.toml`'s `[agents.*]` tables into a `personas` table (keyed by the TOML key as `agentSkillId`), render them as a sidebar of contacts with an idle status dot, and find-or-create a `Thread` row (`kind=dm`, unique per `projectId`+`personaId`) when a persona is clicked. No pty/message sending yet (Story 1.4).

## Boundaries & Constraints

**Always:** Persona catalog = exactly the 12 `[agents.*]` tables in `_bmad/config.toml` (deep-merge any additional/overridden `[agents.*]` tables from `_bmad/custom/config.toml`, keyed by TOML key). `agentSkillId` is the TOML key (e.g. `bmad-agent-analyst`), never the display `name`. Sync runs once at module load (mirrors `src/lib/db.ts`'s singleton pattern): upsert every synced agent, mark any previously-known `agentSkillId` absent from this sync as `status='removed'` (never delete, never re-match by name). `Thread` uniqueness on `(projectId, personaId)` applies only to `kind='dm'` (use a partial unique index so future `kind='channel'` rows with no `personaId` are unaffected).

**Never:** No pty spawn, no message sending/composer submit logic, no WS wiring — that's Story 1.4. Never create a *new* Thread for a persona whose current status is `removed` (only pre-existing threads with a since-removed persona stay reachable). Never parse `_bmad/config.toml` with hand-written regex — use a real TOML parser (add `smol-toml` dependency).

</frozen-after-approval>

## Code Map

- `src/persistence/schema.ts` -- add `personas` (`agent_skill_id` PK, `name`, `title`, `icon`, `description`, `module`, `status` CHECK `active|removed`, `synced_at`) and `threads` (`id` PK nanoid, `project_id` FK, `persona_id` FK nullable, `kind` CHECK `dm|channel`, `status` default `idle`, `created_at`) tables; partial unique index `ON threads(project_id, persona_id) WHERE kind='dm'`
- `src/persistence/projects-repo.ts` -- pattern to copy exactly (class + snake→camel mapper + nanoid + ISO timestamp) for the two new repos below
- `src/persistence/personas-repo.ts` (new) -- `PersonasRepo`: `upsertMany(agents)`, `markRemoved(idsStillPresent)`, `list()`, `findById(id)`
- `src/persistence/threads-repo.ts` (new) -- `ThreadsRepo`: `findOrCreateDm(projectId, personaId)` (select-then-insert, same TOCTOU-tolerant pattern as `src/lib/projects.ts`'s `createProject`), `listByProject(projectId)`
- `src/lib/db.ts` -- add `personasRepo`, `threadsRepo` exports; call a new `syncPersonas(personasRepo)` once after `initSchema(db)`
- `src/lib/personas.ts` (new) -- `syncPersonas(repo)`: read+deep-merge `_bmad/config.toml` and `_bmad/custom/config.toml` via `smol-toml`, extract `[agents.*]` tables, upsert, then `markRemoved` for ids missing from this sync
- `src/lib/projects.ts` -- `createProject`/error-shape pattern (422 body `{error}`) to copy for the threads route's validation
- `src/app/api/projects/route.ts` -- `runtime = 'nodejs'` + `NextResponse.json` pattern to copy for new routes
- `src/app/api/personas/route.ts` (new) -- `GET` -> `personasRepo.list()`
- `src/app/api/projects/[id]/threads/route.ts` (new) -- `GET` -> `threadsRepo.listByProject(id)`; `POST` body `{personaId}` -> 422 if project or persona (by id) not found, 422 if persona `removed` and no existing thread, else `findOrCreateDm`
- `src/app/page.tsx` -- replace the "Active project: <path>" placeholder with a 3-column layout: `ProjectRail` · new `PersonaSidebar` · new minimal thread panel
- `src/components/project-rail.tsx` -- Tailwind/aria conventions (CSS-var tokens, `aria-current`, `title`) to mirror in `PersonaSidebar`
- `src/state/active-project.ts` -- `useSyncExternalStore` + localStorage pattern to copy for new `src/state/active-persona.ts` (resets to `null` whenever `activeProjectId` changes)
- `src/api/client.ts`, `src/api/types.ts` -- add `fetchPersonas()`, `openThread(projectId, personaId)`, `Persona`/`Thread` types
- `src/persistence/projects-repo.spec.ts` -- vitest in-memory-db pattern to copy for `personas-repo.spec.ts`/`threads-repo.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `smol-toml` dependency
- [x] `src/persistence/schema.ts` -- add `personas`/`threads` tables + partial unique index
- [x] `src/persistence/personas-repo.ts`, `src/persistence/threads-repo.ts` -- new repos
- [x] `src/lib/personas.ts` -- TOML sync logic
- [x] `src/lib/db.ts` -- wire new repos + sync call
- [x] `src/app/api/personas/route.ts`, `src/app/api/projects/[id]/threads/route.ts` -- new routes
- [x] `src/api/client.ts`, `src/api/types.ts` -- new client functions/types
- [x] `src/state/active-persona.ts` -- new client state module
- [x] `src/components/persona-sidebar.tsx` -- new component, icon+name+title+idle/removed indicator
- [x] `src/app/page.tsx` -- wire 3-column layout + find-or-create thread on persona click
- [x] `src/persistence/personas-repo.spec.ts`, `src/persistence/threads-repo.spec.ts`, `src/lib/personas.spec.ts` -- unit tests

**Acceptance Criteria:**
- Given the active project, when the persona list renders, then all non-removed personas from `_bmad/config.toml` show with a muted idle status dot.
- Given a persona never messaged in this project, when clicked, then a `Thread` (`kind=dm`) is created and the panel shows an empty/idle state with no pty spawned.
- Given an existing `Thread` with a persona, when clicked again, then the same thread reopens (no duplicate row).
- Given the same persona in a different project, when clicked, then a distinct `Thread` row exists.
- Given a re-sync where an `agentSkillId` disappears, then that `Persona` is marked `removed`, its existing threads stay visible with history, and its composer/list entry shows a disabled/removed indicator.
- Given a re-sync where an `agentSkillId` still exists, then its row is unchanged.

## Implementation Notes

- Added `ProjectsRepo.findById` (not in the original Code Map) — needed by the threads route to 422 on an unknown `projectId`; follows the existing repo pattern exactly.
- `syncPersonas` deep-merges `_bmad/custom/config.toml` over `_bmad/config.toml` by TOML key before extracting `[agents.*]`, per that file's own documented override contract; verified against the real repo config it produces exactly the 12 expected `agentSkillId`s.
- Post-implementation review found `PersonaSidebar` disabled the whole row (`disabled={isRemoved}`) for a removed persona, which blocked reopening that persona's *existing* thread — contradicting the AC that only the composer (not thread visibility) should be disabled for a removed persona. Fixed: the row stays clickable for a removed persona (dimmed via opacity, not `disabled`); the backend route already returns the existing thread (200) when one exists and 422 only when none exists, so a removed persona with no prior thread now correctly surfaces a request error instead of being unreachable.
- No composer exists yet in this story (out of scope, Story 1.4) — "composer disabled" for a removed persona is therefore trivially satisfied; there's nothing to disable yet.

## Review Triage Log

- `high` — [blind-hunter] `readTomlIfExists`'s `parse(raw)` call is unguarded; malformed TOML in `_bmad/config.toml` or `_bmad/custom/config.toml` throws uncaught at `db.ts` module load, crashing the app at boot. Grouped with the two rows below (same defect cluster). Route: patch.
- `high` — [blind-hunter] `readTomlIfExists`'s catch swallows every `readFileSync` error (not just missing-file) as `{}`; combined with `markRemoved`'s empty-array bug below, any read failure silently marks the entire persona catalog `removed`. Grouped, same as above. Route: patch.
- `high` — [blind-hunter] `PersonasRepo.markRemoved([])` drops its `WHERE` clause entirely (`idsStillPresent.length > 0` guards it), so it runs `UPDATE personas SET status='removed'` unconditionally over the whole table whenever zero agents are synced. Verified at `src/persistence/personas-repo.ts`. Route: patch.
- `false` — [blind-hunter] "no `PRAGMA foreign_keys` — orphaned threads possible": refuted — no code path in this diff or the existing codebase deletes a `Project` or `Persona` row (`Persona` rows are only soft-removed via `status`, never deleted), so no orphan can currently occur.
- `medium` — [blind-hunter] No tests for the new `GET/POST /api/personas` and `/api/projects/[id]/threads` routes despite several validation branches. Grouped with the two rows below (same root cause: new code from this diff has zero test coverage). Route: patch.
- `medium` — [blind-hunter] `ProjectsRepo.findById` (added ad hoc this story) has no test. Grouped, same as above. Route: patch.
- `low` — [blind-hunter] No component test for `PersonaSidebar`: rejected — the codebase has no component-test convention at all yet (`ProjectRail`/`AddProjectBrowser` are equally untested), and adding one here would require new test infrastructure (`@testing-library/react`, jsdom) not currently installed — unlikely to be hit in everyday use and the fix is more than a direct correction.
- `low` — [blind-hunter] `page.tsx`'s thread panel can render blank for one tick between selecting a persona and `openThread` resolving (first selection, or after `activePersonaId` resets to `null` on project switch): rejected — a local SQLite round-trip is sub-frame; unlikely to be perceptible, and fixing it needs a new loading-state branch (more than a direct correction). Grouped with the edge-case-hunter row below.
- `false` — [blind-hunter] "422 instead of 404 for not-found reads like an oversight": refuted — this matches the already-established convention in `POST /api/projects` (`createProject`'s 422-for-all-validation-failures shape), not a new inconsistency.
- `low` — [blind-hunter] `smol-toml` pinned with a caret range (`^1.8.0`) while every other dependency is pinned exact: real, fix is a one-line version-string correction (not more than direct correction) — not auto-rejected. Route: patch.
- `false` — [blind-hunter] "no index on `threads(project_id)` — table-scan at scale": refuted — this is an explicitly single-user, single-machine hobby tool (Epic 1 Context); thread volume will never reach a scale where this matters, and the codebase's own conventions reject speculative optimization.
- `high` — [verification-gap, pre-verified] `syncPersonas` silently mass-removes all personas when config.toml is unreadable/unparseable — same defect cluster as the three `blind-hunter` rows above. Route: patch.
- `medium` — [verification-gap, pre-verified] The removed-persona thread-reopen branch in `POST /api/projects/[id]/threads` (the exact regression fixed once already this session) has no test guarding it. Grouped with the two `medium` rows above. Route: patch.
- `medium` — [verification-gap, other] `ProjectsRepo.findById` untested — same as the blind-hunter row above; grouped.
- `high` — [edge-case-hunter] `readTomlIfExists` non-ENOENT errors swallowed as `{}` — same defect cluster as the `high` rows above. Route: patch.
- `high` — [edge-case-hunter] `parse()` unguarded, throws on invalid TOML — same defect cluster. Route: patch.
- `high` — [edge-case-hunter] `markRemoved` with an empty agents array wipes the catalog — same defect cluster. Route: patch.
- `low` — [edge-case-hunter] `GET /api/projects/[id]/threads` doesn't validate the project exists (silently returns `200 []` for an unknown id, unlike `POST`'s 422): real, standalone, fix is a direct 3-line addition mirroring `POST`'s existing check — not auto-rejected. Route: patch.
- `low` — [edge-case-hunter] `page.tsx`'s mount effect reuses one `loadError` state for both `fetchProjects` and `fetchPersonas`, so if both reject, one error message is silently overwritten: rejected — needs both endpoints to fail simultaneously (unlikely in everyday use) and the fix requires a new state variable/branch (more than a direct correction).
- `low` — [edge-case-hunter] Stale thread render during a persona switch: rejected — same as the blind-hunter "blank panel" row above; grouped, no additional distinct outcome (nothing thread-specific is actually rendered from stale `thread` state in this story — only its truthy presence gates the static "No messages yet." copy).
- `false` — [edge-case-hunter] "POST route DB errors propagate as unformatted 500": refuted — this exactly mirrors the already-reviewed, accepted pattern in `POST /api/projects` (`createProject` also rethrows unexpected errors uncaught); not a regression introduced by this diff.
- `false` — [edge-case-hunter] "`upsertMany` always rewrites `synced_at`, contradicting the 'row is unchanged' AC": refuted — `synced_at` is sync-bookkeeping metadata, not business data; the AC's "unchanged" intent (and its own test) concerns `name`/`title`/`icon`/`description`/`module`/`status`, all of which correctly stay identical.

## Verification

**Commands:**
- `pnpm test` -- expected: all specs pass including new persona/thread repo and sync tests
- `pnpm typecheck` -- expected: clean
- `pnpm lint` -- expected: clean
