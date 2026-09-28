'use client';

import { useState } from 'react';
import type { Message, Persona, ThreadStatus } from '@/api/types';
import { parseCardContent } from '@/parsing/card-content';
import type { StreamingMessage } from '@/state/thread-socket';

/**
 * Renders persisted + streaming messages as bubbles (persona avatar/name,
 * `rounded.md`, `surface-raised`) and `system` lines (no chrome,
 * `text-muted`), per DESIGN.md tokens (`src/app/globals.css`). Tool-call
 * and subagent-spawn lines (Story 1.5) render as collapsible `ToolCard`s
 * nested inline at the point they happened, each with independent local
 * expand state — never global. The whole list is `aria-live="polite"` so
 * new content/status changes announce (Epic 1 Context accessibility
 * floor).
 */

interface MessageListProps {
  /** Chronological order (oldest first) — already de-duplicated by caller. */
  messages: Message[];
  personas: Persona[];
  streaming: StreamingMessage | null;
  status: ThreadStatus | null;
}

/** `needs-input` won't occur yet (this story's classifier never emits it) but stays handled for type safety. */
function statusLabel(status: ThreadStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'working':
      return 'Working…';
    case 'needs-input':
      return 'Needs input';
    case 'stopped':
      return 'Stopped';
    default:
      return status satisfies never;
  }
}

function labelFor(personas: Persona[], speakerPersonaId: string | null): string {
  if (speakerPersonaId === null) return 'You';
  const persona = personas.find((p) => p.agentSkillId === speakerPersonaId);
  return persona ? `${persona.icon} ${persona.name}` : speakerPersonaId;
}

function MessageBubble({
  speakerPersonaId,
  content,
  personas,
}: {
  speakerPersonaId: string | null;
  content: string;
  personas: Persona[];
}) {
  const isUser = speakerPersonaId === null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-muted)]">{labelFor(personas, speakerPersonaId)}</span>
      <div
        className={`max-w-[70ch] whitespace-pre-wrap rounded-[10px] px-3 py-2 text-sm ${
          isUser
            ? 'self-start bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'self-start bg-[var(--surface-raised)] text-[var(--text-primary)]'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

/**
 * Collapsed by default, mono summary line always visible, chevron toggles
 * expansion via component-local `useState` (Boundaries: "never global").
 * Nested subagent-cards are found by filtering the flat `messages` array
 * for `parentMessageId === message.id` (Design Notes: no separate tree
 * structure) and rendered one level deeper, independently collapsible.
 */
function ToolCard({ message, allMessages, depth = 0 }: { message: Message; allMessages: Message[]; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const { summary, detail } = parseCardContent(message.content);
  const nested = allMessages.filter((m) => m.parentMessageId === message.id);
  const label = message.kind === 'subagent-card' ? 'Subagent' : 'Tool';

  return (
    <div
      className={`flex flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] p-2 ${depth > 0 ? 'ml-6' : ''}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label.toLowerCase()} call: ${summary}`}
        className="flex items-center gap-2 bg-transparent p-0 text-left"
      >
        <span aria-hidden="true" className="text-[var(--text-muted)]">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="whitespace-pre-wrap font-[family-name:var(--font-mono)] text-xs text-[var(--text-muted)]">
          {summary}
        </span>
      </button>

      {expanded && detail && (
        <pre className="m-0 whitespace-pre-wrap font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)]">
          {detail}
        </pre>
      )}

      {nested.map((child) => (
        <ToolCard key={child.id} message={child} allMessages={allMessages} depth={depth + 1} />
      ))}
    </div>
  );
}

export function MessageList({ messages, personas, streaming, status }: MessageListProps) {
  const isEmpty = messages.length === 0 && !streaming;
  // Subagent-cards nested under an open tool-card render inside that
  // card's own `ToolCard` (found by `parentMessageId`), not as their own
  // top-level entry here. A message whose `parentMessageId` points at a row
  // that isn't in this loaded page (message-history pagination) has no
  // parent to nest under, so treat it as top-level too instead of dropping
  // it silently.
  const messageIds = new Set(messages.map((message) => message.id));
  const topLevelMessages = messages.filter(
    (message) => message.parentMessageId === null || !messageIds.has(message.parentMessageId),
  );

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {status && <p className="m-0 text-xs text-[var(--text-muted)]">{statusLabel(status)}</p>}

      {isEmpty && <p className="m-0 text-[var(--text-muted)]">No messages yet.</p>}

      {topLevelMessages.map((message) => {
        if (message.kind === 'system') {
          return (
            <p key={message.id} className="m-0 text-xs text-[var(--text-muted)]">
              {message.content}
            </p>
          );
        }
        if (message.kind === 'tool-card' || message.kind === 'subagent-card') {
          return <ToolCard key={message.id} message={message} allMessages={messages} />;
        }
        return (
          <MessageBubble
            key={message.id}
            speakerPersonaId={message.speakerPersonaId}
            content={message.content}
            personas={personas}
          />
        );
      })}

      {streaming && (
        <MessageBubble speakerPersonaId={streaming.speakerPersonaId} content={streaming.content} personas={personas} />
      )}
    </div>
  );
}
