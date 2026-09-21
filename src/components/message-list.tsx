import type { Message, Persona, ThreadStatus } from '@/api/types';
import type { StreamingMessage } from '@/state/thread-socket';

/**
 * Renders persisted + streaming messages as bubbles (persona avatar/name,
 * `rounded.md`, `surface-raised`) and `system` lines (no chrome,
 * `text-muted`), per DESIGN.md tokens (`src/app/globals.css`). The whole
 * list is `aria-live="polite"` so new content/status changes announce
 * (Epic 1 Context accessibility floor).
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

export function MessageList({ messages, personas, streaming, status }: MessageListProps) {
  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
    >
      {status && <p className="m-0 text-xs text-[var(--text-muted)]">{statusLabel(status)}</p>}

      {isEmpty && <p className="m-0 text-[var(--text-muted)]">No messages yet.</p>}

      {messages.map((message) =>
        message.kind === 'system' ? (
          <p key={message.id} className="m-0 text-xs text-[var(--text-muted)]">
            {message.content}
          </p>
        ) : (
          <MessageBubble
            key={message.id}
            speakerPersonaId={message.speakerPersonaId}
            content={message.content}
            personas={personas}
          />
        ),
      )}

      {streaming && (
        <MessageBubble speakerPersonaId={streaming.speakerPersonaId} content={streaming.content} personas={personas} />
      )}
    </div>
  );
}
