---
title: 'Migrate to pnpm + Next.js + Biome + Tailwind + Vitest Stack'
type: 'refactor'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'be90920e7b301329cf22537c6e3afe9e5ae081eb'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `bmad-room-chat-ui/` is split across a standalone Node/`tsx` backend (`src/http/*`) and a separate Vite dev server (`web/`), requiring two processes and mismatched tooling (`oxlint`, hand-written CSS, `node:test`) vs. the rest of the user's stack.

**Approach:** Collapse both into a single Next.js (App Router) app run via a custom `server.ts`, on pnpm, Biome, Tailwind, and Vitest — mirroring `../transparencia/`'s tooling. Story 1.1's REST endpoints, persistence, and UI are ported with unchanged behavior; no new features.

## Boundaries & Constraints

**Always:** Preserve Story 1.1's endpoint contracts, `Project` schema/data, and every fix from its review triage log (unique-constraint→422, symlink-following in fs-browse, trimmed-path handling, no dotfile filter, Escape-to-close). Run via a custom `server.ts` (Next's `next()` API + `http.createServer`) so a future `ws.WebSocketServer` can attach to its `upgrade` event — App Router route handlers alone can't serve raw WS. Route handlers touching `better-sqlite3` run on the Node.js runtime (not edge). pnpm only; remove `package-lock.json`. Pin `react`/`react-dom` to `19.3.0`; re-resolve latest Next/Tailwind/Biome/Vitest at scaffold time. All source file names are kebab-case (component identifiers stay PascalCase inside the file, per JSX); test files are `<subject>.spec.ts`/`.spec.tsx`, colocated with their source (per ARCHITECTURE-SPINE.md's Consistency Conventions).

**Never:** No new features, no `Persona`/`Thread`/`Message`/WS code (later stories). No mobile/responsive layout. Don't add component tests beyond porting the 3 existing backend suites — `web/`'s test script was a placeholder, "equivalent coverage" doesn't mean new coverage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev startup | `pnpm dev` | one process serves UI + `/api/*`, no proxy config needed | N/A |
| Cross-origin fetch | request from a different-origin page | blocked by default (no CORS headers sent) — replaces the old manual `ALLOWED_ORIGIN` check, now moot since UI+API share an origin | N/A |
| Existing DB | pre-existing `bmad-room.db` | opens unchanged; same schema, no migration | N/A |

</frozen-after-approval>

## Code Map

- `bmad-room-chat-ui/src/http/{server,projects,fsBrowse}.ts` -- logic ports into `src/app/api/projects/route.ts` and `src/app/api/fs/browse/route.ts`; `readJsonBody`/CORS plumbing is dropped (Next parses JSON bodies natively; same-origin default replaces manual CORS)
- `bmad-room-chat-ui/src/persistence/{schema,projectsRepo}.ts` -- move to `src/persistence/schema.ts`, `src/persistence/projects-repo.ts` (kebab-case; `ProjectsRepo` class identifier unchanged); instantiate the `Database` singleton once (module-level, guarded against Next dev's hot-reload re-import) instead of in `index.ts`
- `bmad-room-chat-ui/src/index.ts` -- replaced by `server.ts` (custom Next server, still reads `PORT`/`BMAD_ROOM_DB_PATH` env vars)
- `bmad-room-chat-ui/web/src/{App.tsx,main.tsx}` -- become `src/app/layout.tsx` + `src/app/page.tsx`
- `bmad-room-chat-ui/web/src/components/{ProjectRail,AddProjectBrowser}.tsx` -- move to `src/components/project-rail.tsx`, `src/components/add-project-browser.tsx` (kebab-case filename; exported identifier stays `ProjectRail`/`AddProjectBrowser`)
- `bmad-room-chat-ui/web/src/state/activeProject.ts`, `web/src/api/{client,types}.ts` -- move to `src/state/active-project.ts`, `src/api/{client,types}.ts` (already kebab-case) unchanged in logic; `App.css`/`index.css` (257 lines) replaced with Tailwind utility classes, same visual result
- `bmad-room-chat-ui/src/*.test.ts` (3 files: `fsBrowse.test.ts`, `projects.test.ts`, `projectsRepo.test.ts`) -- move alongside their source as `fs-browse.spec.ts`, `projects.spec.ts`, `projects-repo.spec.ts`, `node:test`/`node:assert` → `vitest` (`describe`/`test`/`expect`); HTTP-route test adapts to whatever route-handler test approach Next's Node runtime supports (call the handler function directly, or spin up `server.ts`'s `http.Server` as today)
- `package.json` (root, `bmad-room-chat-ui/`, `web/`) -- collapse to one `bmad-room-chat-ui/package.json`; root workspaces / new `pnpm-workspace.yaml` updated; `web/` dir removed
- `web/.oxlintrc.json` -- removed; replaced by `biome.json` at `bmad-room-chat-ui/` root (or repo root, matching transparencia's convention of one root `biome.json`)

## Tasks & Acceptance

**Execution:**
- [x] `bmad-room-chat-ui/package.json`, `pnpm-workspace.yaml`, `biome.json`, `tailwind.config`, `postcss.config` -- scaffold Next.js app + tooling, remove `package-lock.json` and `web/`
- [x] `bmad-room-chat-ui/server.ts` -- custom server wiring Next's request handler over `http.createServer`
- [x] `bmad-room-chat-ui/src/persistence/schema.ts`, `src/persistence/projects-repo.ts` -- port unchanged (kebab-case filenames), singleton DB init
- [x] `bmad-room-chat-ui/src/app/api/projects/route.ts`, `src/app/api/fs/browse/route.ts` -- port handlers, drop CORS/manual body-parsing
- [x] `bmad-room-chat-ui/src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` -- port `App`/`main`, Tailwind base
- [x] `bmad-room-chat-ui/src/components/project-rail.tsx`, `src/components/add-project-browser.tsx` -- port, restyle to Tailwind, same DOM structure/aria attributes
- [x] `bmad-room-chat-ui/src/state/active-project.ts`, `src/api/{client,types}.ts` -- port unchanged
- [x] `bmad-room-chat-ui/src/**/*.spec.ts` -- port 3 suites to Vitest (`fs-browse.spec.ts`, `projects.spec.ts`, `projects-repo.spec.ts`), add `vitest.config.ts`

**Acceptance Criteria:**
- Given `pnpm dev` in `bmad-room-chat-ui/`, when it starts, then exactly one process serves both the UI and `/api/*` (no Vite dev-proxy needed).
- Given Story 1.1's five acceptance criteria (empty state, breadcrumb browser, create/reject project, switch project), when re-run against the migrated app, then all pass unmodified.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, when run from `bmad-room-chat-ui/`, then Biome/`tsc`/Vitest all pass clean.
- Given a hot-reload in Next dev mode, when `src/app/api/*` modules re-evaluate, then no duplicate `Database` connection is opened against `bmad-room.db`.

## Implementation Notes

- App collapsed into `bmad-room-chat-ui/` (no nested `web/`): `src/app` (Next.js App Router + `src/app/api/**/route.ts`), `src/lib` (REST logic, DB singleton), `src/persistence`, `src/components`, `src/state`, `src/api`, plus root `server.ts`.
- `src/lib/db.ts` holds a `globalThis`-guarded singleton `Database`/`ProjectsRepo`, satisfying the hot-reload AC.
- `useSyncExternalStore` in `active-project.ts` needed a `getServerSnapshot` (Next SSRs client components by default); returns `null` server-side since active-project state is client-only by design.
- `tsconfig.json`/`vitest.config.ts` both declare a `@/*` → `src/*` path alias; post-implementation pass replaced all cross-directory relative imports (`../../../lib/...`) with it per user request — same-directory (`./foo`) imports stay relative. Recorded in ARCHITECTURE-SPINE.md's Consistency Conventions ("Imports" row) for future stories.
- `pnpm-workspace.yaml` needed `onlyBuiltDependencies: [better-sqlite3]` — pnpm no longer runs native build scripts by default.
- An untracked `.vscode/mcp.json` (local editor MCP config, unrelated to this story) exists in the working tree; left alone and excluded from this story's diff review — not something to commit.
- Review pass (see Review Triage Log) found and fixed: `server.ts` had no error handling (`prepare()`/`handle()`/`server` error paths all silent); `POST /api/projects` mishandled a truly empty body as 400 instead of the pre-migration 422 contract; the DB-singleton test-isolation comment overclaimed what `vi.resetModules()` alone covers; `.next/` wasn't gitignored for the new layout. All fixed, with regression tests added where applicable; 21/21 tests pass.

## Review Triage Log

- session note: the first review pass (blind-hunter + edge-case-hunter, ~20 findings claiming server.ts/route handlers/components/tests/tooling were never added) ran against a diff file corrupted by a `git add -N`/`git reset` sequencing bug on my part — the reset dropped the intent-to-add markers before regeneration, so the diff omitted every untracked new file. Refuted in full: `pnpm lint`/`typecheck`/`test` all passed throughout, and every claimed-missing file (`server.ts`, `src/app/**`, `src/lib/**`, `src/components/**`, `biome.json`, `vitest.config.ts`, etc.) was confirmed present and correct by direct read. The verification-gap layer caught the corruption itself (its evidence rules require checking the real repo) and its findings below are trusted as-is. Both blind-hunter and edge-case-hunter were re-run against a corrected diff; their findings below are from that second pass.
- verdict: medium | route: patch | source: verification-gap — `src/lib/db.ts`'s `globalThis`-cached DB singleton isn't cleared by `vi.resetModules()`, so the `projects.spec.ts` HTTP-route test's isolation comment overclaimed; a second test importing `@/lib/db` in the same file would silently reuse the first test's cached connection instead of a fresh `:memory:` DB. Verified by reading `db.ts`'s guard logic. Fix: reset `globalThis.__bmadRoomDb` in `beforeEach` alongside `vi.resetModules()`. Applied.
- verdict: medium | route: patch | source: blind-hunter + edge-case-hunter (same root cause) — `server.ts` had no error handling anywhere: `app.prepare().then(...)` had no `.catch`, `handle(req, res)` inside the request callback had no `.catch`, and the `http.Server` had no `'error'` listener — a prepare failure or per-request handler rejection became a silent unhandled rejection instead of a logged, actionable failure. Verified by reading `server.ts`. Fix: added `.catch` on `prepare()` (logs + exits), `.catch` on `handle()` (logs + 500), and a `server.on('error', ...)` handler (logs + exits). Applied.
- verdict: medium | route: patch | source: edge-case-hunter — `POST /api/projects`'s new `request.json()` throws on a truly empty (0-byte) body, collapsing the pre-migration contract's distinction between "no body" (old `readJsonBody()` resolved `undefined`, then `createProject()`'s own validation returned 422 "path is required") and "malformed JSON" (400). Post-migration, both cases returned 400, silently changing the response for an empty POST. Verified by reading `route.ts` and the Fetch API's documented `Request.json()` behavior on an empty body. Fix: read the body as text first, treat a blank/whitespace-only body as `undefined` (→ 422 via `createProject`), and only 400 on non-empty text that fails to parse. Applied, with a regression test for each branch.
- verdict: low | route: patch | source: verification-gap (self-noted gap) — no test exercised `POST /api/projects` with malformed JSON returning 400 (the old suite didn't cover it either, but this was the chance to close it while touching this exact code path). Fix: added `POST /api/projects with malformed JSON returns 400` to `projects.spec.ts`. Applied.
- verdict: medium | route: patch | source: blind-hunter — `pnpm dev`'s `.next/` build cache (146 files, ~22.9MB) got swept into the review diff because neither `bmad-room-chat-ui/.gitignore` nor the repo root's excluded it — the old `web/.gitignore` (which covered `dist`/`node_modules`) was deleted during the migration and never replaced with an equivalent for the new Next.js layout, including its `.next/dev/lock` live-process lock file. Verified: `.next/` and `next-env.d.ts` were absent from both `.gitignore` files. Fix: added `.next` and `next-env.d.ts` to `bmad-room-chat-ui/.gitignore`; deleted the stray `.next/` directory from the working tree. Applied.
- verdict: false | route: reject | source: blind-hunter — claimed `src/persistence/projectsRepo.test.ts` (the old `node:test` suite) was "left undeleted, an orphaned duplicate" of the new `projects-repo.spec.ts`. Refuted: the diff shows it as `deleted file mode 100644`, and it does not exist on disk (`ls src/persistence/` lists only `schema.ts`, `projects-repo.ts`, `projects-repo.spec.ts`).
- verdict: false | route: reject | source: blind-hunter — claimed `layout.tsx`'s `<body>` has no background/token class and the page background is "unverified" outside `page.tsx`'s own wrapper div. Refuted: `globals.css`'s `body { background: var(--surface-base); color: var(--text-primary); ... }` rule (present in the original `index.css` and carried over unchanged) already applies the token at the document level, independent of any React wrapper.
- verdict: low | route: reject | source: blind-hunter — the HTTP-route test now calls the exported `GET`/`POST` route-handler functions directly instead of hitting a real `http.Server` over the network, narrowing coverage of the actual request-handling path. Rejected: this is exactly the adaptation this spec's own Code Map called for ("HTTP-route test adapts to whatever route-handler test approach Next's Node runtime supports (call the handler function directly...)") — not a deviation from spec, so there's no finding to act on here.
- verdict: low | route: reject | source: blind-hunter — no lint rule, test, or CI guard enforces the `export const runtime = 'nodejs'` convention that keeps `better-sqlite3`-touching routes off the edge runtime. Rejected: the fix (a custom lint rule or CI check) is more than a direct correction, and the current surface is two manually-reviewed route files — unlikely to be violated in practice within this story's scope.
- verdict: low | route: reject | source: blind-hunter — `web/README.md` was deleted with no replacement describing the collapsed single-process app. Rejected: no README existed for the top-level `bmad-room-chat-ui/` package before either (the deleted one was Vite-template boilerplate scoped to `web/`), and writing meaningful docs is more than a trivial correction; out of this refactor-only story's scope.
- verdict: false | route: reject | source: blind-hunter — claimed `sprint-status.yaml`'s `in-progress` and this spec's frontmatter `in-review` "disagree on where the story stands." Refuted: these are two different tracking vocabularies at different granularity by design (`sprint-status.yaml`'s own status defs list `backlog/ready-for-dev/in-progress/review/done`, with no `in-review` state at all) — sprint-status syncs at specific workflow checkpoints, not on every spec-status transition.

## Verification

**Commands:**
- `pnpm --filter bmad-room-chat-ui lint` -- expected: no Biome errors
- `pnpm --filter bmad-room-chat-ui typecheck` -- expected: no TypeScript errors
- `pnpm --filter bmad-room-chat-ui test` -- expected: all 3 ported suites pass under Vitest

**Manual checks (if no CLI):**
- Run `pnpm dev`, open the app with the existing `bmad-room.db`, confirm the rail renders prior projects, add-project breadcrumb flow still works end to end, and switching projects updates the accent indicator — matching Story 1.1's manual verification.
