---
title: 'See Tool Calls and Subagent Work Inline'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4a7d0f0be073dfe1384de40860e62a7da71a34bc'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The classifier (Story 1.4) only recognizes text/status/system lines, so any tool invocation or subagent spawn a persona makes mid-turn is invisible — swallowed as plain message text or lost entirely, breaking "chat is a skin over real execution."

**Approach:** Extend the classifier to detect tool-call and subagent-spawn open/update/close lines, mint/patch `Message` rows of kind `tool-card`/`subagent-card` through the same actor-owned persist-then-broadcast pattern Story 1.4 established for `system`, and render them as collapsible cards nested inline in the message list, independently expandable per card.

## Boundaries & Constraints

**Always:** Every tool-card/subagent-card `Message` row is minted (INSERT) at its `*.open` classification, before the corresponding WS event broadcasts, with the WS payload's `messageId`/`parentMessageId` matching the persisted row exactly. A card's `content` column holds a small JSON string `{summary, detail}` (no schema change) — `summary` is the always-visible mono line, `detail` accumulates as `*.update`/`*.close` lines arrive. A subagent-card's `parentMessageId` is its enclosing tool-card's `messageId`; a top-level tool-card's `parentMessageId` is `null`. Expand/collapse state is local per-card component state, never global. New WS event types follow the existing `{type, threadId, payload, ts}` envelope and the `WsEvent`/`ThreadSocketStore.handleFrame` extension pattern from Story 1.4.

**Never:** Do not touch `stop-turn`, `needs-input` status handling, or the `presence` channel — those are Stories 1.6/1.7. Do not persist a new row per `*.update` — only `*.open` inserts a row; `*.update`/`*.close` patch the existing row via a new `MessagesRepo.updateContent()`. Do not invent tool/subagent detection outside `src/parsing/classifier.ts` — it stays the single chat-semantics authority (AD-3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tool call starts | Classifier detects a tool-invocation line | `Message` row (`kind=tool-card`, `parentMessageId=null`) inserted, `tool-card.open` broadcasts with the same `messageId` | N/A |
| Tool output grows | Classifier detects further output lines for the same open tool call | `MessagesRepo.updateContent()` patches `detail`, `tool-card.update` broadcasts | N/A |
| Subagent spawned mid-tool-call | Classifier detects a subagent-invocation line while a tool-card is open | `Message` row (`kind=subagent-card`, `parentMessageId=<open tool-card's messageId>`) inserted, `subagent-card.open` broadcasts | If no tool-card is currently open, treat as a top-level card (`parentMessageId=null`) instead of throwing |
| Call finishes | Classifier detects a completion line for an open card | Row's content finalized via `updateContent()`, matching `*.close` broadcasts, card removed from the actor's open-card tracking | N/A |
| Turn/pty ends with a card still open | Crash, idle-reap, or lingering-flush path fires while a tool/subagent card is open | `flushLingeringTurn()` also closes any still-open card (best-effort finalize, no content loss) | N/A |
| Collapsed card clicked | User clicks its chevron | Local component state toggles to expanded; no network call | N/A |

</frozen-after-approval>

## Code Map

- `src/parsing/classifier.ts` -- add tool-card/subagent-card open/update/close line detection alongside existing message/status/system rules (AD-3, single chat-semantics authority)
- `src/actors/ThreadActor.ts` -- `handleLine()` (line 182) gains cases for the new classified kinds: mint-then-broadcast on `*.open` (mirrors `case 'system'`, line 196), patch-then-broadcast on `*.update`/`*.close`; track currently-open card ids (mirrors `streamingText`'s role) so update/close can address the right row and a nested subagent-card can resolve its parent tool-card's `messageId`; `flushLingeringTurn()` (line 249) must also finalize/close any still-open card
- `src/persistence/messages-repo.ts` + `.spec.ts` -- add `updateContent(id: string, content: string): void` -- `UPDATE messages SET content = ? WHERE id = ?`, no new row
- `src/ws/types.ts` -- add `tool-card.open/update/close`, `subagent-card.open/close` to the `WsEvent` union (same `WsFrameBase & {...}` pattern as existing variants, lines 17-27)
- `src/state/thread-socket.ts` -- `handleFrame()` (line 113) gains cases for the 5 new event types; `update`/`close` find-and-patch the matching entry in `liveMessages` by `messageId` (new logic, no existing in-place-update precedent in this file) instead of pushing a new message
- `src/components/message-list.tsx` -- new `ToolCard` component (collapsed by default, `{typography.mono}` summary line, chevron toggles local `useState`, reuses `--surface-raised`/`--text-muted`/`--radius-md` tokens already used by `MessageBubble`); render nested subagent-cards by filtering `messages` for `parentMessageId === card.id`, indented one level
- `src/actors/ThreadActor.spec.ts`, `src/ws/server.spec.ts`, `src/state/thread-socket.spec.ts` -- extend existing describe blocks for the new event types (per Story 1.4's review note: don't create new spec files for already-covered modules)

## Tasks & Acceptance

**Execution:**
- [x] `src/parsing/classifier.ts` -- add tool-card.open/update/close + subagent-card.open/close detection -- extends AD-3's single classifier authority
- [x] `src/persistence/messages-repo.ts` + `.spec.ts` -- add `updateContent(id, content)` -- patch path for card finalization, schema-free
- [x] `src/actors/ThreadActor.ts` -- handle new classified kinds (mint-then-broadcast on open, patch-then-broadcast on update/close), track open cards, close dangling cards in `flushLingeringTurn()` -- mirrors Story 1.4's `system`/`message` pattern
- [x] `src/ws/types.ts` -- add the 5 new event variants to `WsEvent` -- this story's event vocabulary
- [x] `src/state/thread-socket.ts` -- `handleFrame()` cases for the 5 new event types, in-place patch of `liveMessages` for update/close -- keeps components decoupled from raw WS handling
- [x] `src/components/message-list.tsx` -- `ToolCard` component with per-card expand state, nested subagent-card rendering -- AC2-4
- [x] `src/actors/ThreadActor.spec.ts`, `src/state/thread-socket.spec.ts` -- extend for the new event types (`src/ws/server.spec.ts` needed no change: `server.ts` forwards `WsEvent`s generically and required no edit for the new types)

**Acceptance Criteria:**
- Given a turn invokes a tool, when the classifier emits `tool-card.open`, then a `Message` row (`kind=tool-card`) is minted before the WS event broadcasts, sharing its `parentMessageId` with the event payload.
- Given a tool card is open, when it renders, then it's collapsed by default with its mono summary line visible, nested inline at the point the call happened.
- Given a collapsed card, when its chevron is clicked, then it expands to full input/output with per-card, not global, expand state.
- Given a subagent is spawned, when `subagent-card.open` fires, then a nested, independently collapsible subagent card appears under its parent tool card.
- Given an open card, when its `*.close` event arrives, then the card reflects completion without losing its accumulated content.

### Review Findings

- [x] [Review][Patch] Live `tool-card`/`subagent-card` patches are silently dropped once the card's `*.open` row is already in REST-fetched `history` — `page.tsx`'s `displayedMessages` merge excludes any `liveMessages` entry whose id is already in `historyIds`, so a `tool-card.update`/`.close` patch computed into `ThreadSocketStore` state never renders once a thread switch (or any history refetch) has pulled in that card mid-open [src/app/page.tsx:89-90] — fixed: overlay `liveMessages` onto `history` by id (keeping `history`'s ordering) instead of excluding matching ids.
- [x] [Review][Patch] `ClassifiedLine`'s `card-close` variant declares `text?: string`, but `classifyLine()` can never actually produce a `card-close` with empty/undefined text (`DURATION_SUFFIX_PATTERN` requires a non-empty duration match) — the optional type exists only to justify `ThreadActor`'s defensive `if (classified.text)` guard on the no-open-card fallback; simplify by making `text` non-optional (or documenting why the classifier's guarantee doesn't extend to the type) [src/parsing/classifier.ts:26, src/actors/ThreadActor.ts:271-274] — fixed: `text` is now non-optional on `card-close`, and the no-open-card fallback calls `emitMessageLine` unconditionally, matching `card-update`.
- [x] [Review][Defer] Classifier's tool-open/card-continuation/duration-suffix patterns are unverified against a real Claude Code CLI transcript (strict end-anchoring on the duration suffix can leave a real completion line misclassified as `card-update`; the same suffix pattern is loose enough to close a card on incidental non-completion text; the tool-name comparison is case-sensitive against the literal `'Task'`; `CARD_CONTINUATION_PATTERN` requires at least one leading whitespace before `⎿`) — deferred: already flagged as an explicit unverified-pattern risk in this spec's own Design Notes and the classifier's inline comments, pending the manual verification step on an unrestricted machine; real risk (medium) if the real CLI output differs, but not actionable without that transcript [src/parsing/classifier.ts:47-59]
- [x] [Review][Defer] `ThreadActor.openCards` is in-memory only — a process restart (crash outside the pty-exit path, deploy, dev-server reload) loses that tracking while a card is open, and the persisted `Message` row for that card is never closed (no `*.close` row/broadcast, no startup recovery that re-derives and finalizes orphaned open cards) — deferred: same class of gap as the already-deferred reconnect issue below (mid-turn resume across a connection/process boundary), in scope for Story 1.9 ("Resume a Conversation After Reopening the App") per this epic's Cross-Story Dependencies [src/actors/ThreadActor.ts:68]

**Rejected:**
- `false` — spec frontmatter `status: 'done'` vs `sprint-status.yaml`'s `review` for this story is an inconsistency: refuted — same normal transient workflow state already established and refuted for Story 1.4 in this file's own Review Triage Log (item on sprint-status timing); `sprint-status.yaml` syncs to its final status at this review's presentation step.
- `low` — duplicated `## Review Triage Log` heading and an empty `## Spec Change Log` heading in this spec file are leftover artifacts: not fixed — the fix would mean editing the spec document under review itself, out of scope for a code-review pass over the diff.
- `low` — `ThreadSocketStore.handleFrame()` casts incoming WS `payload` with `as {...}` without runtime shape validation, and no test exercises a malformed payload: not fixed — payloads are server-typed `WsEvent`s constructed in-process (not externally supplied input) in this single-user local tool; adding runtime validation here would be defensive complexity for a scenario the code's own type guarantees already rule out.
- `false` — `openCard()`/`closeTopCard()`'s `as WsEvent` broadcast-object type assertion bypasses TypeScript's discriminated-union checking, risking an undetected future mismatch: refuted for the current code — both card-open variants (`tool-card.open`/`subagent-card.open`) and both card-close variants share an identical payload shape today, so no mismatch exists; the assertion is the standard workaround for constructing a union member from a computed discriminant.
- `low` — Nothing distinguishes a still-open (in-progress) card from a closed one in `ToolCard`'s rendering, so a user watching a long tool call gets no "still running" visual cue: not fixed — neither the frozen Intent/Boundaries nor the I/O matrix requires this, and adding it means a new UI state (and likely an `aria-live` update) beyond this diff's scope.
- `false` — Card summary text is the verbatim CLI line rather than the friendlier phrasing `epic-1-context.md`'s UX section illustrates (`Editing src/api/auth.ts`): refuted — the frozen spec's own Implementation Notes describe line-shape-driven detection using the raw `⏺ Name(args)` marker as the summary; the context doc's line was an illustrative example, not a binding AC.
- `false` — No test exercises `handleCrash()` closing a still-open card specifically (only `reapIdle()`'s idle-reap path is tested against an open card): refuted as a demonstrated defect — `handleCrash()` and `reapIdle()` both route through the same `flushLingeringTurn()` → `closeAllOpenCards()` call chain, which reading the code shows is depth/path-independent (LIFO `while` loop); this is the same "coverage gap with no demonstrated bad outcome" already accepted in this file's own Review Triage Log for the analogous "no test for closeAllOpenCards with a nested stack" finding.

## Implementation Notes

- Card open/close detection is line-shape-driven, not stateful in the classifier: `⏺ Name(args)` opens (`Task(...)` → subagent, else tool), a `⎿`-prefixed continuation line updates, and that same shape ending in a duration suffix (`(2.1s)`, `(450ms)`) closes. A single line can't say *which* open card it closes, so the classifier reports a generic `card-close` and `ThreadActor` resolves it via a LIFO `openCards` stack (matches the I/O matrix's "no tool-card open → top-level" edge case for subagent spawns, and lets a subagent's own close pop before its parent tool-card's).
- `src/ws/server.ts`/`.spec.ts` needed no change — it forwards `WsEvent`s generically and has no per-type logic, so the 5 new event types required no edits there.
- The I/O matrix's "Collapsed card clicked" row (local state toggle, no network call) has no automated test: this codebase has no component-test setup at all (`vitest.config.ts` only includes `src/**/*.spec.ts`, no jsdom/testing-library dependency), matching the precedent already accepted in Story 1.3's and 1.4's reviews ("no component-test convention exists yet"). Covered instead by this spec's Verification manual-check step.

## Spec Change Log

## Review Triage Log

- `medium` — [blind-hunter] `case 'message'` in `src/actors/ThreadActor.ts` only accumulates `streamingText`, committed as one `text` `Message` row at turn-idle — so text before/after a mid-turn tool call ends up in a single row created *after* the tool-card's row, violating AC2's "nested inline at the point the call happened" for any turn where text surrounds a tool call. Verified: `completeTurnIfAny()` is only called from the `status`/idle branch and `flushLingeringTurn()`, never from `tool-open`/`subagent-open`. Route: patch — commit any pending `streamingText` as a `text` message (reusing `completeTurnIfAny`'s persist/broadcast shape, without resetting `inFlightTurn`) before opening a tool-card/subagent-card.
- `medium` — [blind-hunter, edge-case-hunter] `case 'status'`'s idle branch (`src/actors/ThreadActor.ts`) never calls `closeAllOpenCards()` — only `handleCrash()`/`reapIdle()`/`flushLingeringTurn()` do. If the classifier's unverified close-detection ever misses a real completion line, an open card leaks past the normal end-of-turn and can nest a later, unrelated card under it for up to the 30-minute idle-reap window. Verified via grep: `closeAllOpenCards` has exactly those 2 call sites. Route: patch — call `this.closeAllOpenCards()` before `this.completeTurnIfAny(thread)` in the idle branch.
- `medium` — [edge-case-hunter] `case 'card-update'`/`case 'card-close'` (`src/actors/ThreadActor.ts`) both `return` with no action when `this.openCards` is empty (`if (!top) return`) — a stray `⎿`-shaped line with no open card silently discards that line's content: not persisted, not broadcast, not shown anywhere. Verified by reading both branches. Route: patch — when no card is open, fall back to treating `classified.text` as an ordinary `message` line instead of dropping it.
- `low` — [blind-hunter] `parseCardContent` (`src/components/message-list.tsx`) and `parseCardSummary` (`src/state/thread-socket.ts`) independently hand-parse the same `{summary, detail}` JSON shape with separate try/catch fallbacks — a future change to the card-content shape must be updated in both, and nothing ties them together. Verified: both functions exist independently, confirmed by reading each file. Route: patch — extract one shared parse helper (and its type) both files import.
- `medium` — [verification-gap, pre-verified] `openCard()` (`src/actors/ThreadActor.ts`) persists a tool-card/subagent-card row with `speakerPersonaId: thread.personaId`, but the `tool-card.open`/`subagent-card.open` WS payload type (`src/ws/types.ts`) never carries `speakerPersonaId`, so `thread-socket.ts`'s handler hardcodes the live-reconstructed message to `speakerPersonaId: null` — the persisted row and the live-rendered row disagree until the next REST reload. Currently inert (`ToolCard` never reads `speakerPersonaId`), but Epic 2's Story 2.2 ("attribute each persona's contribution in the channel") depends on this epic's tool-card behavior applying unchanged inside party-mode channels, where the field will matter. Route: patch — add `speakerPersonaId` to both `*.open` payload types and use it instead of the hardcoded `null` in `thread-socket.ts`.
- `low` — [edge-case-hunter] `MessageList`'s `topLevelMessages` filter (`src/components/message-list.tsx`) only renders `parentMessageId === null` at the top level; if a subagent-card's parent tool-card row falls outside the loaded page (`fetchMessages` default 50-message limit), the child is excluded from both the top-level render and any parent's nested render — silently invisible. Verified `fetchMessages(threadId)` is called with no `before` param today (no "load more" UI wired yet, `src/app/page.tsx`), so this needs a single turn producing 50+ card events to actually straddle a page boundary — real but rare for this single-user local tool. Route: patch — treat a `parentMessageId` with no matching entry in the loaded `messages` array as top-level instead of filtering it out.
- `false` — [blind-hunter] "`card-update` on an open subagent-card is persisted but never broadcast (no `subagent-card.update` event), so an expanded subagent card shows no incremental output": refuted as a code defect — `src/ws/types.ts`'s own doc comment states this is a deliberate spec decision ("There is no `subagent-card.update`: subagent cards only ever open and close"), consistent with the Code Map.
- `false` — [blind-hunter] "no test covers `closeAllOpenCards()`/`flushLingeringTurn()` with more than one nested open card at once": refuted — `closeAllOpenCards()`'s `while (this.openCards.length &gt; 0) { this.closeTopCard(); }` correctly pops LIFO regardless of stack depth; reading the code shows no depth-dependent bug, only a coverage gap with no demonstrated bad outcome.
- `false` — [blind-hunter] "`sprint-status.yaml` says `1-5: in-progress` while the spec says `status: 'in-review'` with all tasks checked, an inconsistency vs. how Story 1.4 was marked": refuted as a code defect — this is this workflow's own normal transient state during the review step itself (`sprint-status.yaml` syncs to its final status at presentation, step-05), the same non-issue explicitly logged and refuted in Story 1.4's own triage log.
- `false` — [blind-hunter] "`MessageList`'s `aria-live='polite'` region re-announces a card's entire growing `detail` block on every `*.update`/`*.close`, over-announcing to screen-reader users": refuted — this is the exact same "replace the whole string on every delta" pattern Story 1.4 already established for the streaming `message.delta` bubble (accepted, unflagged there); not a new regression introduced by this story, and the `&lt;pre&gt;` only renders at all once a card is expanded.
- `false` — [blind-hunter, edge-case-hunter] "`TOOL_OPEN_PATTERN`/`DURATION_SUFFIX_PATTERN` are too strict/too loose and could misclassify real CLI lines (false negatives on non-alpha tool names, false positives on incidental duration-shaped text)": refuted as a new code defect — the spec's own Design Notes and the classifier's inline comments already flag exactly this class of risk as unverified (sandbox blocks real `node-pty.spawn()`) and call for manual pattern validation against a real transcript; not a gap introduced beyond what's already documented and deferred to that manual check.
- `defer` — [edge-case-hunter] `thread-socket.ts`'s `tool-card.update`/`tool-card.close`/`subagent-card.close` handlers `.map()`-patch by `messageId` and silently no-op if that id isn't in `liveMessages` (e.g. a socket reconnecting mid-turn misses the `*.open` event). This is the same class of gap `thread-socket.ts`'s own doc comment already accepts for `message.delta`/`message.complete` ("no reconnect/resume-in-flight-stream handling here — Story 1.9"), not a new defect introduced by this story.

## Review Triage Log

## Design Notes

Card content is stored as JSON (`{summary, detail}`) inside the existing single `content TEXT` column rather than adding schema columns — keeps this story migration-free. `ToolCard` follows `MessageBubble`'s existing token usage and the project's no-animation convention for state changes (Reduce Motion floor, `src/app/globals.css`). Nesting is rendered by filtering the flat `messages` array for `parentMessageId === card.id`, not a separate tree structure.

**Risk, not fully verified end-to-end** (same caveat as Story 1.4): this environment's sandbox blocks real `node-pty.spawn()`, so the classifier's tool-call/subagent-spawn line patterns are written without a real Claude Code CLI transcript to validate against. They need a manual run on an unrestricted machine per Verification below, with `classifier.ts`'s patterns adjusted if real output differs.

## Verification

**Commands:**
- `pnpm test` -- expected: all specs pass, including new classifier/ThreadActor/thread-socket cases
- `pnpm typecheck` -- expected: no errors
- `pnpm lint` -- expected: no errors

**Manual checks (if no CLI):**
- On an unrestricted machine, trigger a real tool call and a real subagent spawn in a DM thread; confirm the card renders collapsed with a correct summary, expands on click, and reflects completion after `*.close` without losing content.
