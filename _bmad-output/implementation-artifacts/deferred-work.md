# Deferred Work

## Deferred from: code review of story-1.2 (2026-09-19)

- Error color `#b3261e` is hardcoded as raw hex in three places instead of a design token [src/app/page.tsx:48, src/components/add-project-browser.tsx:109,132] — pre-existing since before this migration (same hardcoded value was in `App.css`), ported as-is, not introduced by this story.
- `server.ts` has no graceful shutdown (SIGINT/SIGTERM) handling for the DB connection [server.ts] — pre-existing since before this migration (the old `index.ts` had none either).

## Deferred from: code review of story-1.3 (2026-09-20)

- Persona-selection/thread-load transitions in the thread panel aren't wrapped in an `aria-live` region [src/app/page.tsx] — unverified against epic-1-context.md's "status changes" accessibility-floor requirement, since this story introduces no live messages or status changes (status dot is static `idle`); would need confirmation whether pre-message thread-selection transitions are in scope now or only from Story 1.4's live WS events onward. If in scope, severity would be medium.
- New route handlers have no top-level catch-all for unexpected (non-validation) errors, so an unhandled DB exception falls through to Next's default HTML/opaque error page instead of the routes' own JSON `{error}` shape [src/app/api/projects/[id]/threads/route.ts, src/app/api/personas/route.ts] — pre-existing since Story 1.2's migration (the pre-existing `POST /api/projects` route has the identical gap, never flagged in its own review); not introduced by this story.
- `ProjectsRepo`/`PersonasRepo`/`ThreadsRepo` all call `db.prepare(sql)` inline per method call instead of caching prepared statements on the instance [src/persistence/*.ts] — pre-existing pattern from `ProjectsRepo` (Story 1.1), copied for consistency; a real micro-optimization but unlikely to matter at this hobby tool's realistic data volume.
- The raw-body-to-JSON parsing/400 block is duplicated verbatim between `src/app/api/projects/route.ts` and the new `src/app/api/projects/[id]/threads/route.ts` instead of a shared helper — real duplication risk (a future change to the JSON-body contract could drift between the two), but fixing it means touching the already-shipped, already-reviewed Story 1.2 route file for a refactor-only reason; deferred rather than expanding this story's blast radius.
- The "never create a new Thread for a removed persona" rule lives only in the HTTP route handler (`POST /api/projects/[id]/threads`) rather than in `ThreadsRepo.findOrCreateDm` itself — a future second caller (a script, a channels endpoint) could bypass it by calling the repo directly. Only one caller exists today; revisit if/when a second caller is added.
