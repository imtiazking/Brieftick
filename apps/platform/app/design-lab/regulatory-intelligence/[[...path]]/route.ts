import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getDesignLabRegulatoryIntelligenceRoot } from '@/lib/monorepo-paths';

const LAB_ROOT = getDesignLabRegulatoryIntelligenceRoot();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function resolveLabFile(segments: string[] | undefined): string | null {
  const parts = segments?.filter(Boolean) ?? [];
  let rel = parts.join('/');
  if (!rel) rel = 'index.html';
  else if (rel.endsWith('/')) rel += 'index.html';
  const rootResolved = path.resolve(LAB_ROOT);
  const absResolved = path.resolve(LAB_ROOT, rel);
  if (absResolved !== rootResolved && !absResolved.startsWith(rootResolved + path.sep)) {
    return null;
  }
  if (!existsSync(absResolved)) return null;
  if (statSync(absResolved).isDirectory()) {
    const index = path.join(absResolved, 'index.html');
    return existsSync(index) ? index : null;
  }
  return absResolved;
}

type Params = { params: Promise<{ path?: string[] }> };

export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params;
  const filePath = resolveLabFile(segments);
  if (!filePath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.mjs' || ext === '.json') {
    const body = await readFile(filePath, 'utf8');
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
      },
    });
  }
  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=60' },
  });
}
