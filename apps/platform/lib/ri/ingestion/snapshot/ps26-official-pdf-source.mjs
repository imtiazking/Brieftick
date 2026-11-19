/**
 * Resolve official FCA PS26/1 PDF bytes (tracked fixture → optional cache → HTTPS fetch).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../../eval/eval-paths.mjs';
import { PS26_1_STAGING } from './ps26-1-staging-identity.mjs';

const TRACKED_FIXTURE = join(
  REPO_ROOT,
  'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf',
);
const LEGACY_CACHE = join(REPO_ROOT, 'docs/eval/regulatory-sources/cache/fca-ps26-1-official.pdf');

export function assertPs26OfficialPdfSha256(pdfBytes) {
  const sha256 = createHash('sha256').update(pdfBytes).digest('hex');
  if (sha256 !== PS26_1_STAGING.expectedPrimaryPdfSha256) {
    const err = new Error('ps26_primary_pdf_sha256_mismatch');
    err.expected = PS26_1_STAGING.expectedPrimaryPdfSha256;
    err.actual = sha256;
    throw err;
  }
  return { sha256, byteLength: pdfBytes.length };
}

export async function loadPs26OfficialPdfBytes(options = {}) {
  const allowNetwork = options.allowNetworkFetch === true;
  const paths = [options.pdfPath, TRACKED_FIXTURE, LEGACY_CACHE].filter(Boolean);
  for (const p of paths) {
    if (existsSync(p)) {
      const pdfBytes = readFileSync(p);
      const verified = assertPs26OfficialPdfSha256(pdfBytes);
      return { pdfBytes, source: p, ...verified, networkFetch: false };
    }
  }
  if (!allowNetwork) {
    const err = new Error('ps26_official_pdf_not_available_locally');
    err.trackedFixture = TRACKED_FIXTURE;
    err.expectedSha256 = PS26_1_STAGING.expectedPrimaryPdfSha256;
    throw err;
  }
  const res = await fetch(PS26_1_STAGING.officialPdfUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`ps26_official_pdf_fetch_failed_${res.status}`);
  const pdfBytes = Buffer.from(await res.arrayBuffer());
  const verified = assertPs26OfficialPdfSha256(pdfBytes);
  return { pdfBytes, source: PS26_1_STAGING.officialPdfUrl, ...verified, networkFetch: true };
}