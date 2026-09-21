import type { MessageKind, ThreadStatus } from '@/persistence/schema';

/**
 * WS envelope (Epic 1 Context Technical Decisions): every frame this story
 * emits or accepts is `{ type, threadId, payload, ts }`. Events this story
 * emits: `message.delta`, `message.complete`, `status`, `system`.
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
  | (WsFrameBase & { type: 'system'; payload: { messageId?: string; content: string } });

export type WsCommandType = 'send-message' | 'stop-turn' | 'open-in-terminal';

export interface WsCommand {
  type: WsCommandType;
  threadId: string;
  payload?: unknown;
  ts?: number;
}
