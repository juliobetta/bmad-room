# Deferred Work

## Deferred from: code review of story-1.2 (2026-09-19)

- Error color `#b3261e` is hardcoded as raw hex in three places instead of a design token [src/app/page.tsx:48, src/components/add-project-browser.tsx:109,132] — pre-existing since before this migration (same hardcoded value was in `App.css`), ported as-is, not introduced by this story.
- `server.ts` has no graceful shutdown (SIGINT/SIGTERM) handling for the DB connection [server.ts] — pre-existing since before this migration (the old `index.ts` had none either).
