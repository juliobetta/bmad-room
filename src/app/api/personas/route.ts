import { NextResponse } from 'next/server';
import { personasRepo } from '@/lib/db';

// better-sqlite3 is a native addon — this route must run on the Node.js
// runtime, never edge.
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(personasRepo.list());
}
