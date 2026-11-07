import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { getSplitThemeStylesheetPath } from '@/lib/monorepo-paths';

/** Serves the repo-root split theme stylesheet at /styles/split-theme.css (Design Lab ri.css @import). */
export async function GET() {
  try {
    const body = await readFile(getSplitThemeStylesheetPath(), 'utf8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
