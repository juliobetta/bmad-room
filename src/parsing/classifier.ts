/**
 * Single chat-semantics authority (AD-3): maps a single rendered,
 * de-flickered terminal line (from `terminal-buffer.ts`) to one of this
 * story's event categories. No other module re-derives chat semantics
 * from raw bytes. Story 1.4's ruleset covers `message`/`status`/`system`;
 * this story (1.5) adds tool-call/subagent-spawn line detection.
 *
 * Card open/close is line-shape-driven, not stateful here: a `tool-open`/
 * `subagent-open` line always looks like `⏺ Name(args)` (the CLI's own
 * tool-invocation marker), and a `card-close` line is that same `⎿`
 * continuation shape but ending in a duration parenthetical (e.g.
 * `(2.1s)`), which the CLI emits once a call/subagent finishes. Because a
 * single line can't say *which* currently-open card it closes (a
 * subagent's own completion line has the same shape as a tool's), that
 * resolution is deliberately left to `ThreadActor`'s open-card stack
 * (Code Map) — this module only reports "close the most recent card".
 */

export type ClassifiedLine =
  | { kind: 'message'; text: string }
  | { kind: 'status'; status: 'idle' | 'working' }
  | { kind: 'system'; text: string }
  | { kind: 'tool-open'; summary: string }
  | { kind: 'subagent-open'; summary: string }
  | { kind: 'card-update'; text: string }
  | { kind: 'card-close'; text?: string }
  | { kind: 'ignore' };

// A spinner glyph (braille spinner frames, or common ASCII/unicode
// "working" markers used by CLI tools) followed by a space and more text
// signals an in-progress status line, e.g. "⠋ Thinking…", "✳ Reading file…".
const SPINNER_PATTERN = /^\s*[⠀-⣿*·✢✳✻⏳](?:\s+\S)/u;

// The CLI's idle input prompt: a bare "> " (optionally with trailing
// whitespace) once no output is being produced.
const IDLE_PROMPT_PATTERN = /^>\s*$/;

// Lines the CLI itself reports as failures — surfaced as `system`, not a
// persona message.
const SYSTEM_PATTERN = /^(error|failed|warning)\s*:/i;

// The CLI's own tool-invocation marker: "⏺ ToolName(args)". `Task` is the
// subagent-spawning tool; every other name is an ordinary tool call.
// **Risk (unverified — Design Notes):** written without a real Claude
// Code CLI transcript (sandbox blocks `node-pty.spawn()`); adjust this
// pattern against real output on an unrestricted machine per Verification.
const TOOL_OPEN_PATTERN = /^⏺\s+([A-Za-z][\w.-]*)\((.*)\)\s*$/u;
const SUBAGENT_TOOL_NAME = 'Task';

// A `⎿`-prefixed continuation line is the tool/subagent's growing output.
// **Risk (unverified):** same caveat as above.
const CARD_CONTINUATION_PATTERN = /^\s+⎿\s+(.*)$/u;

// A continuation line ending in a duration — e.g. "(2.1s)", "(450ms)",
// "...· 3m 12s)" — is the CLI's completion marker for that call/subagent;
// only the trailing "<digits><unit>)" shape is required, since text
// preceding it inside the parenthetical varies (tool-use counts, token
// counts, etc). **Risk (unverified):** same caveat as above.
const DURATION_SUFFIX_PATTERN = /\d(?:ms|s)\)\s*$/u;

export function classifyLine(rawLine: string): ClassifiedLine {
  const trimmedEnd = rawLine.replace(/\s+$/u, '');
  const trimmed = trimmedEnd.trim();

  if (trimmed.length === 0) return { kind: 'ignore' };
  if (IDLE_PROMPT_PATTERN.test(trimmed)) return { kind: 'status', status: 'idle' };
  if (SPINNER_PATTERN.test(trimmedEnd)) return { kind: 'status', status: 'working' };
  if (SYSTEM_PATTERN.test(trimmed)) return { kind: 'system', text: trimmed };

  const toolOpenMatch = TOOL_OPEN_PATTERN.exec(trimmed);
  if (toolOpenMatch) {
    const toolName = toolOpenMatch[1];
    return toolName === SUBAGENT_TOOL_NAME
      ? { kind: 'subagent-open', summary: trimmed }
      : { kind: 'tool-open', summary: trimmed };
  }

  const continuationMatch = CARD_CONTINUATION_PATTERN.exec(trimmedEnd);
  if (continuationMatch) {
    const text = (continuationMatch[1] ?? '').trim();
    return DURATION_SUFFIX_PATTERN.test(text) ? { kind: 'card-close', text } : { kind: 'card-update', text };
  }

  return { kind: 'message', text: trimmedEnd };
}
