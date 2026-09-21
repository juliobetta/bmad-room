import { NextResponse } from 'next/server';
import { messagesRepo, threadsRepo } from '@/lib/db';

// better-sqlite3 is a native addon — this route must run on the Node.js
// runtime, never edge.
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const DEFAULT_LIMIT = 50;

/**
 * Paginated `GET /api/threads/[id]/messages?before=<messageId>&limit=50` —
 * REST bootstrap before a thread's WS connection opens. Newest-page-first,
 * same validation/error shape as `GET /api/projects/[id]/threads`.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id: threadId } = await params;

  if (!threadsRepo.findById(threadId)) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 422 });
  }

  const url = new URL(request.url);
  const before = url.searchParams.get('before') ?? undefined;

  const limitParam = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 422 });
    }
    limit = parsed;
  }

  const messages = messagesRepo.listByThread(threadId, { before, limit });
  return NextResponse.json(messages);
}
