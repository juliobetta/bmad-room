import { NextResponse } from 'next/server';
import { personasRepo, projectsRepo, threadsRepo } from '@/lib/db';

// better-sqlite3 is a native addon — this route must run on the Node.js
// runtime, never edge.
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  if (!projectsRepo.findById(id)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 422 });
  }

  return NextResponse.json(threadsRepo.listByProject(id));
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id: projectId } = await params;

  const raw = await request.text();
  let body: unknown;
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  const rawPersonaId =
    typeof body === 'object' && body !== null && 'personaId' in body
      ? (body as { personaId: unknown }).personaId
      : undefined;

  if (typeof rawPersonaId !== 'string' || rawPersonaId.trim().length === 0) {
    return NextResponse.json({ error: 'personaId is required' }, { status: 422 });
  }
  const personaId = rawPersonaId.trim();

  const project = projectsRepo.findById(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 422 });
  }

  const persona = personasRepo.findById(personaId);
  if (!persona) {
    return NextResponse.json({ error: 'Persona not found' }, { status: 422 });
  }

  // Never create a *new* Thread for a persona whose current status is
  // removed — only pre-existing threads with a since-removed persona stay
  // reachable.
  if (persona.status === 'removed') {
    const existing = threadsRepo.findDm(projectId, personaId);
    if (!existing) {
      return NextResponse.json({ error: 'Persona has been removed' }, { status: 422 });
    }
    return NextResponse.json(existing, { status: 200 });
  }

  const thread = threadsRepo.findOrCreateDm(projectId, personaId);
  return NextResponse.json(thread, { status: 200 });
}
