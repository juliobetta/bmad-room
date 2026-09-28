import type { MessageKind, ThreadStatus } from '@/persistence/schema';

/**
 * WS envelope (Epic 1 Context Technical Decisions): every frame this story
 * emits or accepts is `{ type, threadId, payload, ts }`. Events Story 1.4
 * emits: `message.delta`, `message.complete`, `status`, `system`. Story 1.5
 * adds `tool-card.open/update/close` and `subagent-card.open/close` — a
 * card's `Message` row is minted at `*.open` (its `messageId` matches the
 * broadcast payload exactly), `*.update`/`*.close` patch that same row and
 * carry only the accumulated `detail`. There is no `subagent-card.update`:
 * subagent cards only ever open and close (Code Map).
 * `stop-turn`/`open-in-terminal` command names are reserved by the wider
 * vocabulary but have no handler yet (Stories 1.6/1.10) — this story only
 * handles `send-message`.
 */

interface WsFrameBase {
  threadId: string;
  ts: number;
}

export type WsEvent =
  | (WsFrameBase & {
      type: 'message.delta';
      payload: { speakerPersonaId: string | null; content: string };
    })
  | (WsFrameBase & {
      type: 'message.complete';
      payload: { messageId: string; speakerPersonaId: string | null; kind: MessageKind; content: string };
    })
  | (WsFrameBase & { type: 'status'; payload: { status: ThreadStatus } })
  | (WsFrameBase & { type: 'system'; payload: { messageId?: string; content: string } })
  | (WsFrameBase & {
      type: 'tool-card.open';
      payload: { messageId: string; parentMessageId: string | null; summary: string; speakerPersonaId: string | null };
    })
  | (WsFrameBase & { type: 'tool-card.update'; payload: { messageId: string; detail: string } })
  | (WsFrameBase & { type: 'tool-card.close'; payload: { messageId: string; detail: string } })
  | (WsFrameBase & {
      type: 'subagent-card.open';
      payload: { messageId: string; parentMessageId: string | null; summary: string; speakerPersonaId: string | null };
    })
  | (WsFrameBase & { type: 'subagent-card.close'; payload: { messageId: string; detail: string } });

export type WsCommandType = 'send-message' | 'stop-turn' | 'open-in-terminal';

export interface WsCommand {
  type: WsCommandType;
  threadId: string;
  payload?: unknown;
  ts?: number;
}
