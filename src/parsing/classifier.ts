/**
 * Single chat-semantics authority (AD-3): maps a single rendered,
 * de-flickered terminal line (from `terminal-buffer.ts`) to one of this
 * story's event categories. No other module re-derives chat semantics
 * from raw bytes. This story's ruleset only distinguishes
 * `message`/`status`/`system` — `tool-card`/`subagent-card` patterns are
 * Story 1.5.
 */

export type ClassifiedLine =
  | { kind: 'message'; text: string }
  | { kind: 'status'; status: 'idle' | 'working' }
  | { kind: 'system'; text: string }
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

export function classifyLine(rawLine: string): ClassifiedLine {
  const trimmedEnd = rawLine.replace(/\s+$/u, '');
  const trimmed = trimmedEnd.trim();

  if (trimmed.length === 0) return { kind: 'ignore' };
  if (IDLE_PROMPT_PATTERN.test(trimmed)) return { kind: 'status', status: 'idle' };
  if (SPINNER_PATTERN.test(trimmedEnd)) return { kind: 'status', status: 'working' };
  if (SYSTEM_PATTERN.test(trimmed)) return { kind: 'system', text: trimmed };
  return { kind: 'message', text: trimmedEnd };
}
