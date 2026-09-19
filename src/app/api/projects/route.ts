import { NextResponse } from 'next/server';
import { projectsRepo } from '@/lib/db';
import { createProject, listProjects } from '@/lib/projects';

// better-sqlite3 is a native addon — this route must run on the Node.js
// runtime, never edge.
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(listProjects(projectsRepo));
}

export async function POST(request: Request): Promise<NextResponse> {
  // An empty body is not malformed JSON — it's "no path given", which
  // createProject() already turns into its own 422. Only a non-empty body
  // that fails to parse is a genuine 400 (matches the pre-migration
  // readJsonBody() contract, which resolved `undefined` for a 0-byte body
  // instead of throwing).
  const raw = await request.text();
  let body: unknown;
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  const result = await createProject(projectsRepo, body);
  return NextResponse.json(result.body, { status: result.status });
}
