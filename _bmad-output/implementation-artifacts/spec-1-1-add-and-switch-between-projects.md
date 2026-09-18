---
title: 'Add and Switch Between Projects'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'NO_VCS'
context: ['{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-room-2026-09-17/DESIGN.md', '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-bmad-room-2026-09-18/ARCHITECTURE-SPINE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No app exists yet. There is no way to register a real project checkout or see it in a project rail, so nothing exists to scope personas/threads to in later stories.

**Approach:** Scaffold the `bmad-room-chat-ui/` package (backend + web) per the architecture spine, and build the vertical slice this story needs: `Project` persistence, a backend-resolved directory browser (`GET /api/fs/browse`), project list/create REST endpoints, and the project-rail UI (empty state, add-project breadcrumb flow, switch-active-project).

## Boundaries & Constraints

**Always:** Only a backend-resolved path returned by `GET /api/fs/browse` may ever be written to `Project.path` — never a client-supplied string (AD-7). Scaffold and use only the top-level module dirs this story needs: `src/persistence`, `src/http`, `web/`. Pin stack versions from ARCHITECTURE-SPINE.md's Stack table at scaffold time (re-resolving Vite's own create-vite patch version). Active project selection is client-side only — no server-persisted "current project" row, since there is no auth/session.

**Never:** No pty spawn, no WS server, no `Persona`/`Thread`/`Message` tables or endpoints — those belong to later stories. No native OS/browser directory picker. No mobile/responsive layout (desktop-width only, per UX-DR20).

**Decisions:**
- A directory is a valid "real project checkout" only if it contains a `.git` directory AND is writable (write access is needed early because Story 1.3 will register symlink excludes in `.git/info/exclude`).
- `GET /api/fs/browse` is unrestricted — no path is off-limits (single-user local tool, no multi-tenant boundary to enforce) — but the in-app breadcrumb browser opens at the user's home directory by default; the user can navigate to any volume/drive from there (e.g. `/Volumes/...`).
- This story scaffolds and uses only `src/persistence`, `src/http`, and `web/`. It does not create placeholder `src/actors`, `src/pty`, `src/parsing`, `src/ws` directories — later stories add those when needed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No projects yet | empty `Project` table, app opens | rail shows only "+"; copy "No projects yet — add one to start chatting." | N/A |
| Browse directories | `GET /api/fs/browse?path=X` | returns child directories of `X` as backend-resolved absolute paths | unreadable/nonexistent path -> 400 with error body |
| Create valid project | `POST /api/projects {path}` from a browse selection | `Project` row created, 201, new rail icon appears | N/A |
| Create invalid project | `POST /api/projects {path}` failing checkout validation | no row created | 422 with reason; UI shows the error, no rail icon added |
| Switch project | click a different rail icon | that project becomes active client-side; persona/channel list re-scopes (empty until Story 1.2) | N/A |

</frozen-after-approval>

## Code Map

- Greenfield: no existing `bmad-room-chat-ui/` package or code to reuse. This story creates the package from scratch per ARCHITECTURE-SPINE.md's Structural Seed.
- `_bmad-output/planning-artifacts/architecture/architecture-bmad-room-2026-09-18/ARCHITECTURE-SPINE.md` — module layout, stack versions, AD-7 (fs-browse), Consistency Conventions (naming, id/timestamp formats) to follow exactly.
- `_bmad-output/planning-artifacts/ux-designs/ux-bmad-room-2026-09-17/DESIGN.md` — design tokens (colors, typography, rounded/spacing scales) for the rail and add-project browser.
- `_bmad-output/planning-artifacts/ux-designs/ux-bmad-room-2026-09-17/EXPERIENCE.md` — empty-state copy, rail/breadcrumb interaction detail.

## Tasks & Acceptance

**Execution:**
- [x] `bmad-room-chat-ui/package.json` -- scaffold package (backend + web workspaces) -- establishes the new package per Structural Seed
- [x] `bmad-room-chat-ui/src/persistence/schema.ts` -- define `Project` table (better-sqlite3): `id` (nanoid), `path`, `createdAt` (ISO-8601 UTC) -- entity model per Consistency Conventions
- [x] `bmad-room-chat-ui/src/persistence/projectsRepo.ts` -- create/list `Project` rows -- backs the REST endpoints
- [x] `bmad-room-chat-ui/src/http/fsBrowse.ts` -- `GET /api/fs/browse?path=` handler, backend-resolved listing only -- AD-7
- [x] `bmad-room-chat-ui/src/http/projects.ts` -- `GET /api/projects`, `POST /api/projects` with checkout validation -- bootstrap REST layer
- [x] `bmad-room-chat-ui/web/src/components/ProjectRail.tsx` -- icon rail, empty state, active-project indicator, "+" affordance -- UX-DR3, UX-DR16
- [x] `bmad-room-chat-ui/web/src/components/AddProjectBrowser.tsx` -- breadcrumb directory browser against `/api/fs/browse`, submit to `POST /api/projects` -- UX-DR4
- [x] `bmad-room-chat-ui/web/src/state/activeProject.ts` -- client-side active-project selection state -- no server session

**Acceptance Criteria:**
- Given no projects exist, when the app opens, then the rail shows only the "+" affordance and the empty-state copy.
- Given the "+" is clicked, when the breadcrumb browser opens, then it lists only backend-resolved directories from `GET /api/fs/browse` — no client-supplied path reaches `POST /api/projects` unvalidated.
- Given a selected directory passes validation, when confirmed, then a `Project` row is created and a new rail icon appears immediately.
- Given a selected directory fails validation, when confirmed, then no `Project` row is created and an error is shown.
- Given at least one project exists, when a different rail icon is clicked, then it becomes active and gets the accent left-edge indicator.

## Implementation Notes

- Scaffolded `bmad-room-chat-ui/` via `npm create vite@latest web -- --template react-ts`, then re-pinned `react`/`react-dom` to exactly `19.3.0` and `typescript` to `5.9.3` (create-vite's defaults were `^19.2.8` and `~6.0.2`) to match ARCHITECTURE-SPINE.md's Stack table (TypeScript stays "5.x", not the newly-released major).
- Added a root `package.json` (repo previously had none) declaring `workspaces: ["bmad-room-chat-ui", "bmad-room-chat-ui/web"]` — required for the spec's own `npm run ... --workspace=bmad-room-chat-ui` verification commands to resolve at all.
- Backend HTTP layer is hand-rolled on Node's built-in `http` module (no Express/Fastify) — the Stack table lists no HTTP framework and the surface area (3 routes) didn't warrant one.
- `nanoid` and a small `Content-Type: application/json` allowance were added even though not in the Stack table, since the Consistency Conventions mandate nanoid ids and JSON bodies are unavoidable for `POST /api/projects`; pinned to `5.1.16` (patched — `5.0.x` had a published high-severity advisory).
- AD-7 ("never trust a client-supplied path verbatim") is enforced server-side, not just via the UI flow: `POST /api/projects` independently re-resolves the given path with `fs.realpath` and re-validates `.git` + writability on disk, regardless of how the client obtained the string.
- Added a UNIQUE constraint on `projects.path` (not explicitly required by the I/O matrix) so re-adding the same checkout is rejected with 422 rather than creating a duplicate rail icon — a reasonable inference, flagged here in case product intent differs.
- npm's `--workspace=<name>` flag, when the addressed workspace has a nested child workspace on disk (`bmad-room-chat-ui/web` under `bmad-room-chat-ui/`), also runs the script in that nested workspace and hard-fails if the script is missing. Added `typecheck`/`test` scripts to `web/package.json` (the latter a placeholder — no web unit tests exist yet) so the spec's exact verification commands succeed unmodified.
- `web/vite.config.ts` proxies `/api` to the backend port (default `4317`, override via `BACKEND_PORT`) for `npm run dev` convenience; the backend also sends permissive CORS headers independently since this is a single-user local tool.
- Active-project selection ties into `App.tsx`: on load, if the stored/active id isn't in the fetched project list (e.g. first run), it falls back to the first project. This wiring lives in `App.tsx` rather than the state module, keeping `activeProject.ts` a pure client-side store as scoped.

## Spec Change Log

## Review Triage Log

- verdict: high | route: patch | source: blind-hunter — `server.ts:48` sends `Access-Control-Allow-Origin: *` unconditionally alongside an unrestricted, unauthenticated fs-browse/project-create API; any webpage open in the same browser could enumerate the filesystem and register junk projects. Verified: no origin check exists anywhere in the request handler. Fix: restrict the allowed origin to the web dev server's own origin.
- verdict: medium | route: patch | source: blind-hunter + edge-case-hunter (same root cause) — `projectsRepo.create()` has no try/catch around the `UNIQUE`-constrained insert, and `createProject()`'s `findByPath` pre-check leaves a TOCTOU window; a concurrent duplicate-path POST throws uncaught and returns 500 instead of the documented 422. Verified in `projects.ts`/`projectsRepo.ts`: no constraint-violation handling exists. Fix: catch the unique-constraint error and return 422.
- verdict: medium | route: patch | source: blind-hunter + edge-case-hunter (same root cause) — `fsBrowse.ts:48` filters with `entry.isDirectory()` on `Dirent`, which does not follow symlinks, so symlinked project directories never appear in the browser. Verified against Node's documented `Dirent` behavior. Fix: additionally `stat()` symlink entries to detect directory targets.
- verdict: low | route: patch | source: edge-case-hunter — `fsBrowse.ts:26` computes `target` from the untrimmed `requestedPath` even though it checks `.trim().length > 0`; a whitespace-padded query value resolves relative to server `cwd` instead of the intended path. Verified by reading the line. Fix is a one-token change (use the trimmed value); kept despite low likelihood because the fix is trivial.
- verdict: low | route: patch | source: blind-hunter — `fsBrowse.ts:48`'s `!entry.name.startsWith('.')` filter makes any project checkout that itself lives at a dotfile-prefixed path permanently unreachable through the Add-Project UI (no other path-entry mechanism exists in this story). Verified: the filter unconditionally excludes such entries. Fix is a one-line removal; kept despite narrow likelihood because the fix is trivial.
- verdict: low | route: patch | source: blind-hunter — `AddProjectBrowser.tsx`'s dialog (`role="dialog" aria-modal="true"`) has no `Escape`-to-close handling, leaving keyboard-only users without a way to dismiss it besides the on-screen close button. Verified: no keydown handler exists. Fix is a small `useEffect` keydown listener; kept despite low likelihood because the fix is trivial.
- verdict: medium (pre-verified, arrives from verification-gap layer per its evidence rules) | route: patch | source: verification-gap — no test exercises the "directory not writable" branch of `validateProjectCheckout()` in `projects.test.ts`; deleting that check entirely would not fail any existing test (`makeValidCheckout()` fixtures are always writable). Fix: add a test that revokes write permission on a valid `.git` checkout and asserts rejection.
- verdict: low | route: reject (out of scope) | source: blind-hunter — no `DELETE /api/projects/:id` route exists to remove a registered project. The story's own title and Approach text scope this story to add/list/switch only; removal is a future-story concern the intent itself excludes, not a defect in this one.
- verdict: low | route: reject | source: blind-hunter + edge-case-hunter (same root cause) — `AddProjectBrowser.tsx`'s `breadcrumbSegments()` splits on `/` and hardcodes it as the root, which would misrender for a Windows-style path. Rejected: this is a single-user local tool with no stated Windows target, the fix would require a moderate refactor to consume backend-supplied segments instead of string-splitting, and the defect is unlikely to be met in practice.
- verdict: low | route: reject | source: blind-hunter — `GET /api/fs/browse` returns every child directory with no cap or pagination, so an enormous directory would render as one unvirtualized list. Rejected: unlikely in practice (users navigate toward known project roots, not arbitrary huge system directories) and the fix (pagination/virtualization) is more than a trivial correction.
- verdict: false | route: reject | source: blind-hunter — claimed tooling/lint inconsistency between the backend and web workspaces, and missing root-level dev documentation. Rejected: no named user- or developer-facing harm, only a stylistic observation; per triage rules this is graded false rather than a severity.
- verdict: low | route: reject | source: blind-hunter + edge-case-hunter (same root cause) — `readJsonBody()` buffers the full POST body with no size cap before `JSON.parse`. Rejected: the only caller is this story's own frontend posting a single small `{path}` object, exposure is further reduced once the CORS entry above is patched, and no concrete harm path remains within this story's scope.
- verdict: low | route: reject | source: edge-case-hunter — rapid clicking through the breadcrumb/list before an earlier `browse()` call resolves could let a stale response overwrite a newer one (no request token/abort). Rejected: local `fs.readdir` calls resolve near-instantly, making the race window practically unreachable, and the fix (request-token/abort tracking) is more than a trivial correction.
- verdict: false | route: reject | source: edge-case-hunter — claimed a stale `activeProjectId` could linger in `localStorage`/state after the project list becomes empty. Rejected: unreachable via the app itself in this story's scope (no delete endpoint exists), and even if a stale id lingered, `activeProject` already resolves to `null` and the UI correctly falls back to the empty-state placeholder.
- verdict: low | route: reject | source: edge-case-hunter — a non-numeric `PORT` env var yields `NaN` and crashes `server.listen()` at startup. Rejected: this is a loud, immediate fail-fast on operator misconfiguration, not a user-facing regression in normal operation.
- verdict: low | route: reject | source: edge-case-hunter — an unwritable/nonexistent `BMAD_ROOM_DB_PATH` directory throws synchronously from `new Database(...)` at startup. Rejected: same fail-fast rationale as the `PORT` finding above — a loud, immediate misconfiguration error, not a silent regression.
- verdict: low | route: reject | source: edge-case-hunter — `activeProject.ts` has no `storage`-event listener, so two browser tabs open on the app at once won't sync active-project selection between them. Rejected: this is a single-user local tool typically used in one tab, no acceptance criterion covers multi-tab sync, and the fix (wiring a cross-tab event listener) is more than a trivial correction.

## Verification

**Commands:**
- `npm run typecheck --workspace=bmad-room-chat-ui` -- expected: no TypeScript errors
- `npm test --workspace=bmad-room-chat-ui` -- expected: persistence + http route tests pass

**Manual checks (if no CLI):**
- Start the backend + web dev servers, open the app with an empty DB, add a real project via the breadcrumb browser, confirm the rail icon appears and switching projects updates the accent indicator.

**Manual verification performed (2026-09-18):** ran the dev servers with an empty DB and drove the UI with a headless-Chromium script (Playwright) against two throwaway `.git` checkouts. Confirmed: (1) empty rail shows only "+" and the exact copy "No projects yet — add one to start chatting."; (2) the breadcrumb browser opens against `GET /api/fs/browse`-returned paths only; (3) adding a valid checkout creates a rail icon immediately; (4) with two projects added, clicking the other rail icon switches the active project and moves the accent left-edge indicator (`project-rail__icon--active`) — no console errors. Screenshots taken, not retained.
