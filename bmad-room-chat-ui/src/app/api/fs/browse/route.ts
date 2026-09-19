import { NextResponse } from 'next/server';
import { BrowseError, browseDirectory } from '@/lib/fs-browse';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  try {
    const result = await browseDirectory(url.searchParams.get('path'));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BrowseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
