/**
 * Shared `{summary, detail}` JSON shape stored in a `tool-card`/
 * `subagent-card` `Message` row's `content` column, and the one parser for
 * it — previously duplicated (with slightly different fallbacks) between
 * `message-list.tsx`'s `parseCardContent` and `thread-socket.ts`'s
 * `parseCardSummary`.
 */
export interface CardContent {
  summary: string;
  detail: string;
}

/** Falls back to treating unparsable content as a bare summary with no detail. */
export function parseCardContent(content: string): CardContent {
  try {
    const parsed = JSON.parse(content) as { summary?: string; detail?: string };
    return { summary: parsed.summary ?? '', detail: parsed.detail ?? '' };
  } catch {
    return { summary: content, detail: '' };
  }
}
