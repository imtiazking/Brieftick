/**
 * Read-only PS26/1 PDF runtime smoke (no DB, no Anthropic, no ingestion).
 * Invoked from authenticated internal diagnostic route only.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { REPO_ROOT } from '../eval/eval-paths.mjs';
import { PS26_1_STAGING } from '../ingestion/snapshot/ps26-1-staging-identity.mjs';

const CONC_PROVISION_CHECKS = [
  { id: 'CONC 4.2A.3R', patterns: [/CONC\s+4\.2A\.3\s*R/i, /\b4\.2A\.3\s*R\b/] },
  { id: 'CONC 4.2A.6R', patterns: [/CONC\s+4\.2A\.6\s*R/i, /\b4\.2A\.6\s*R\b/] },
  { id: 'CONC 7.20.1R', patterns: [/CONC\s+7\.20\.1\s*R/i, /\b7\.20\.1\s*R\b/] },
];

function locateConcProvisions(fullText) {
  const haystack = String(fullText || '');
  const found = [];
  for (const check of CONC_PROVISION_CHECKS) {
    if (check.patterns.some((p) => p.test(haystack))) found.push(check.id);
  }
  return found;
}

const snapshotDir = join(REPO_ROOT, 'apps/platform/lib/ri/ingestion/snapshot');

/**
 * @returns {Promise<{
 *   ok: boolean;
 *   programme: string;
 *   modules: Record<string, boolean>;
 *   pdf: { sha256Match: boolean; byteLength: number; pageCount: number; concMarkersFound: string[] };
 *   guards: { aiExecutionEnabled: boolean; anthropicConfigured: boolean };
 *   errors: string[];
 * }>}
 */
export async function runPdfRuntimeSmokeCore() {
  const errors = [];
  const modules = {
    regulatoryPdfExtract: false,
    pdfPhysicalPageParser: false,
    extractionQuality: false,
    createPrimaryPdfExtractionRevision: false,
    ps26OfficialPdfSource: false,
  };

  const coreDir = join(REPO_ROOT, 'integrations/regulatory-sources/core');

  try {
    const { extractRegulatoryPdfContent } = await import(
      pathToFileURL(join(coreDir, 'regulatory-pdf-extract.mjs')).href
    );
    modules.regulatoryPdfExtract = typeof extractRegulatoryPdfContent === 'function';
  } catch (e) {
    errors.push(`regulatory-pdf-extract: ${e.message || e}`);
  }

  try {
    const { parsePdfPhysicalPages } = await import(
      pathToFileURL(join(coreDir, 'pdf-physical-page-parser.mjs')).href
    );
    modules.pdfPhysicalPageParser = typeof parsePdfPhysicalPages === 'function';
  } catch (e) {
    errors.push(`pdf-physical-page-parser: ${e.message || e}`);
  }

  try {
    const { assessExtractionQuality } = await import(
      pathToFileURL(join(coreDir, 'extraction-quality.mjs')).href
    );
    modules.extractionQuality = typeof assessExtractionQuality === 'function';
  } catch (e) {
    errors.push(`extraction-quality: ${e.message || e}`);
  }

  try {
    const { createPrimaryPdfExtractionRevision } = await import(
      pathToFileURL(join(snapshotDir, 'create-primary-pdf-extraction-revision.mjs')).href
    );
    modules.createPrimaryPdfExtractionRevision = typeof createPrimaryPdfExtractionRevision === 'function';
  } catch (e) {
    errors.push(`create-primary-pdf-extraction-revision: ${e.message || e}`);
  }

  let pdfBytes;
  let sha256;
  let byteLength = 0;
  try {
    const { loadPs26OfficialPdfBytes } = await import(
      pathToFileURL(join(snapshotDir, 'ps26-official-pdf-source.mjs')).href
    );
    modules.ps26OfficialPdfSource = typeof loadPs26OfficialPdfBytes === 'function';
    const loaded = await loadPs26OfficialPdfBytes({ allowNetworkFetch: false });
    pdfBytes = loaded.pdfBytes;
    sha256 = loaded.sha256;
    byteLength = loaded.byteLength;
  } catch (e) {
    errors.push(`ps26_official_pdf: ${e.message || e}`);
  }

  let pageCount = 0;
  const concMarkersFound = [];
  if (pdfBytes && modules.regulatoryPdfExtract) {
    try {
      const { extractRegulatoryPdfContent } = await import(
        pathToFileURL(join(coreDir, 'regulatory-pdf-extract.mjs')).href
      );
      const extracted = await extractRegulatoryPdfContent(pdfBytes);
      if (extracted?.ok) {
        pageCount = extracted.pageCount ?? extracted.structured?.pageCount ?? 0;
        const blob = extracted.fullText || (extracted.structured?.pages || []).map((p) => p.text || '').join('\n');
        concMarkersFound.push(...locateConcProvisions(blob));
      } else {
        errors.push(`pdf_extract_failed: ${extracted?.code || 'unknown'}`);
      }
    } catch (e) {
      errors.push(`pdf_extract: ${e.message || e}`);
    }
  }

  const expectedSha = PS26_1_STAGING.expectedPrimaryPdfSha256;
  const sha256Match =
    Boolean(sha256) &&
    sha256 === expectedSha &&
    Boolean(pdfBytes) &&
    createHash('sha256').update(pdfBytes).digest('hex') === expectedSha;

  const aiExecutionEnabled = process.env.RI_AI_EXECUTION_ENABLED === 'true';
  const anthropicConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_KEY?.trim(),
  );

  const moduleOk = Object.values(modules).every(Boolean);
  const pdfOk =
    sha256Match && byteLength > 100_000 && pageCount > 50 && concMarkersFound.length >= 2;
  const guardsOk = !aiExecutionEnabled;

  return {
    ok: moduleOk && pdfOk && guardsOk && errors.length === 0,
    programme: 'forgeniq.ps26.pdf-runtime-smoke.v1',
    modules,
    pdf: {
      sha256Match,
      byteLength,
      pageCount,
      concMarkersFound,
      concMarkersExpected: CONC_PROVISION_CHECKS.length,
    },
    guards: {
      aiExecutionEnabled,
      anthropicConfigured,
      note: 'No Anthropic execution performed; configuration flag reported only.',
    },
    errors,
  };
}