#!/usr/bin/env node
/**
 * Read-only provenance audit for docs/eval/supplemental-corpus-2b2/
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const DIR = join(REPO_ROOT, 'docs', 'eval', 'supplemental-corpus-2b2');

const FIXTURE_SOURCES = {
  'integrations/regulatory-sources/fixtures/fca-html-samples.mjs': [
    'COOKIE_CSS_BEFORE_ARTICLE',
    'DATA_PAGE_ARTICLE',
    'POLICY_STATEMENT_PAGE',
    'CONSULTATION_PAGE',
    'MULTI_FIRM_PAGE',
  ],
};

function classifySample(text) {
  const t = String(text || '');
  if (/included to introduce realistic publication competition/i.test(t)) {
    return 'SYNTHETIC';
  }
  if (/PS24\/1 sets out final rules for operational resilience/i.test(t)) return 'SYNTHETIC';
  if (/CP24\/2 consults on changes to consumer credit/i.test(t)) return 'SYNTHETIC';
  if (/Review of fair treatment in private markets/i.test(t)) return 'SYNTHETIC';
  if (/Flood risk exposure of residential mortgages/i.test(t)) return 'SYNTHETIC';
  if (/Defence SMEs need fair access to banking/i.test(t)) return 'SYNTHETIC';
  return 'UNVERIFIED_EXCERPT';
}

const publications = [];
let verified = 0;
let unverified = 0;
let synthetic = 0;

for (const file of readdirSync(DIR)) {
  if (!file.endsWith('.json') || file === 'catalogue.json') continue;
  const pack = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const excerpts = (pack.verifiedTextSamples || []).map((s) => {
    const classification = classifySample(s.extractedText);
    if (classification === 'SYNTHETIC') synthetic += 1;
    else unverified += 1;
    return {
      sectionReference: s.sectionReference,
      classification,
      contentComplete: false,
      authenticity: 'not_from_publication_canonical_extract',
      reason:
        classification === 'SYNTHETIC'
          ? 'Catalogue abstract or regression HTML fixture text; not extracted from this publication canonical URL.'
          : 'Short excerpt without staging extraction_revision or source hash linkage.',
      textPreview: String(s.extractedText || '').slice(0, 120),
    };
  });

  publications.push({
    file,
    publicationId: pack.publicationId,
    publicationTitle: pack.publicationTitle,
    regulator: pack.regulator,
    canonicalUrl: pack.canonicalUrl,
    stagingCatalogueRowId: pack.publicationId,
    extractionRevisionId: pack.extractionRevisionId || null,
    exportMethod: pack.retrievalProvenance?.exportSource || pack.exportSource,
    contentHash: pack.contentSha256,
    authenticPublicationMetadata: Boolean(pack.canonicalUrl && pack.publicationId),
    textProvenance:
      'metadata from staging regulatory_publications; body text from fixture keyword mapping in export-supplemental-corpus-2b2-readonly.mjs',
    contentScope: 'excerpt_only',
    classification: 'EXCLUDED_FROM_AUTHORITATIVE_RETRIEVAL',
    exclusionReason:
      'No regulatory_source_extraction_revision; fixture/synthetic passages must not be indexed as FCA evidence.',
    excerpts,
  });
}

const report = {
  auditVersion: 1,
  generatedAt: new Date().toISOString(),
  directory: DIR,
  fixtureSources: FIXTURE_SOURCES,
  summary: {
    publicationCount: publications.length,
    verifiedSourceExcerpts: verified,
    unverifiedExcerpts: unverified,
    syntheticExcerpts: synthetic,
    publicationsExcludedFromRetrievalEvaluation: publications.length,
  },
  publications,
  safeguards: [
    'All 18 supplemental pack JSON files are quarantined from authoritative regulatory indexing.',
    'Only frozen evidence-packs (3 publications with full extractions) remain authoritative for offline eval.',
  ],
};

const outJson = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-d-supplemental-provenance-audit.json');
const outMd = join(REPO_ROOT, 'docs', 'eval', 'phase-2b2-step-d-supplemental-provenance-audit.md');
writeFileSync(outJson, JSON.stringify(report, null, 2));
writeMarkdown(outMd, report);
console.log(JSON.stringify(report.summary));

function writeMarkdown(mdPath, r) {
  const lines = [
    '# Supplemental corpus provenance audit (Phase 2B.2 Step D)',
    '',
    `Generated: ${r.generatedAt}`,
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Publications | ${r.summary.publicationCount} |`,
    `| VERIFIED_SOURCE excerpts | ${r.summary.verifiedSourceExcerpts} |`,
    `| UNVERIFIED_EXCERPT | ${r.summary.unverifiedExcerpts} |`,
    `| SYNTHETIC excerpts | ${r.summary.syntheticExcerpts} |`,
    `| Publications excluded | ${r.summary.publicationsExcludedFromRetrievalEvaluation} |`,
    '',
    '## Classification rule',
    '',
    'Catalogue metadata (title, URL, staging UUID) is staging-verified. All body text in supplemental packs is **SYNTHETIC** or **UNVERIFIED_EXCERPT** and excluded from authoritative retrieval.',
    '',
  ];
  for (const p of r.publications) {
    lines.push(`### ${p.publicationTitle}`);
    lines.push('');
    lines.push(`- **Publication ID:** ${p.publicationId}`);
    lines.push(`- **Regulator:** ${p.regulator}`);
    lines.push(`- **URL:** ${p.canonicalUrl}`);
    lines.push(`- **Extraction revision:** ${p.extractionRevisionId ?? 'none'}`);
    lines.push(`- **Pack classification:** ${p.classification}`);
    lines.push('');
  }
  writeFileSync(mdPath, lines.join('\n'));
}
