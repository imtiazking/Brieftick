import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getDesignLabRegulatoryIntelligenceRoot } from '@/lib/monorepo-paths';

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

export function resolveDesignLabRelativePath(segments: string[] | undefined): string | null {
  const parts = segments?.filter(Boolean) ?? [];
  let rel = parts.join('/');
  if (!rel) rel = 'index.html';
  else if (rel.endsWith('/')) rel += 'index.html';
  const labRoot = getDesignLabRegulatoryIntelligenceRoot();
  const rootResolved = path.resolve(labRoot);
  const absResolved = path.resolve(labRoot, rel);
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

const PUBLISHABLE_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9+/=_-]+$/;

/** Exposes the (public) Clerk publishable key so the bundle can load the Clerk browser SDK. */
export type DesignLabProductShell = 'regulatory_intelligence' | 'risk_controls';

export function readDesignLabProductMode(): DesignLabProductShell {
  return 'regulatory_intelligence';
}

export function injectProductShellMeta(html: string, product: DesignLabProductShell): string {
  if (!html.includes('</head>')) return html;
  let out = html.replace(
    '</head>',
    `  <meta name="forgeniq-product" content="${product}">\n</head>`,
  );
  if (product === 'risk_controls') {
    out = out.replace(
      /<title>[^<]*<\/title>/,
      '<title>FORGENIQ — Risk &amp; Controls</title>',
    );
    out = out.replace(
      /id="ri-environment-banner"[^>]*>[^<]+</,
      'id="ri-environment-banner" class="ri-demo-banner ri-environment-banner--demo">RISK &amp; CONTROLS — Operational GRC (connected staging). Regulatory Intelligence corpus features are on hold.<',
    );
  }
  return out;
}

export function injectClerkPublishableKey(html: string, publishableKey: string | undefined): string {
  const key = publishableKey?.trim();
  if (!key || !PUBLISHABLE_KEY_PATTERN.test(key) || !html.includes('</head>')) return html;
  return html.replace('</head>', `  <meta name="forgeniq-clerk-publishable-key" content="${key}">\n</head>`);
}

export async function designLabFileResponse(
  filePath: string | null,
  options?: { productShell?: DesignLabProductShell },
): Promise<NextResponse> {
  if (!filePath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.mjs' || ext === '.json') {
    const raw = await readFile(filePath, 'utf8');
    let withVersion = ext === '.html' ? stampDesignLabAssetVersion(raw) : raw;
    if (ext === '.html' && options?.productShell) {
      withVersion = injectProductShellMeta(withVersion, options.productShell);
    }
    const body =
      ext === '.html' ? injectClerkPublishableKey(withVersion, process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) : withVersion;
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

/** Bust HTML entry references so a new release cannot reuse a cached app.js from an older deploy. */
export function stampDesignLabAssetVersion(html: string): string {
  let version = 'dev';
  try {
    const idPath = path.join(process.cwd(), '.forgeniq-build-id');
    if (existsSync(idPath)) version = readFileSync(idPath, 'utf8').trim().slice(0, 12) || version;
  } catch {
    version = 'dev';
  }
  return html.replace(
    '/design-lab/regulatory-intelligence/js/app.js"',
    `/design-lab/regulatory-intelligence/js/app.js?v=${encodeURIComponent(version)}"`,
  );
}

export async function serveDesignLabSegments(segments: string[] | undefined): Promise<NextResponse> {
  return designLabFileResponse(resolveDesignLabRelativePath(segments));
}

export async function serveRiskControlsDesignLabSegments(segments: string[] | undefined): Promise<NextResponse> {
  return designLabFileResponse(resolveDesignLabRelativePath(segments), { productShell: 'risk_controls' });
}
