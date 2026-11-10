#!/usr/bin/env node
/**
 * BUS-UAT-018 — Read-only FG22/5 catalogue assessment + controlled ingest plan (no mutations).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertApprovedPrimaryPdfUrl, FCA_PUBLICATIONS_RSS_SOURCE_KEY } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';

export const FG22_5_PRIMARY_PDF_URL =
  'https://www.fca.org.uk/publication/finalised-guidance/fg22-5.pdf';

const FAIR_VALUE_PUB = '56b0beca-d8c3-4267-a794-9079009af661';

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(dir, '../../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const urlCheck = assertApprovedPrimaryPdfUrl(FCA_PUBLICATIONS_RSS_SOURCE_KEY, FG22_5_PRIMARY_PDF_URL);

const { data: fgPubs } = await admin
  .from('regulatory_publications')
  .select('id, title, canonical_url, external_document_id')
  .or('title.ilike.%FG22%,canonical_url.ilike.%fg22-5%,external_document_id.ilike.%FG22%')
  .limit(8);

const { data: fairValue } = await admin
  .from('regulatory_publications')
  .select('id, title')
  .eq('id', FAIR_VALUE_PUB)
  .maybeSingle();

const plan = {
  step: 'bus-uat-018-fg22-5-ingestion-assessment',
  readOnly: true,
  officialPdfUrl: FG22_5_PRIMARY_PDF_URL,
  urlAllowlist: urlCheck,
  fairValuePublication: fairValue,
  fg22CatalogueMatches: fgPubs || [],
  separateFromFairValueWebpage: true,
  authorisedPipeline: [
    '1. FCA RSS ingest (controlled pilot / manual catalogue row) → regulatory_publications + publication_version + source_snapshot with primary PDF bytes',
    '2. createPrimaryPdfExtractionRevision (same as scripts/staging/ingest-cp26-38-primary-pdf.mjs)',
    '3. Verify pdf_primary_v1 revision + page boundaries via verify-extraction-revision-retrieval.mjs',
    '4. Ask RI supplementary resolution via resolveSupplementaryPdfPublicationIds (distinct publication UUID)',
  ],
  proposedMutationsRequiringApproval: [
    'Create regulatory_publications row for FG22/5 (distinct UUID; canonical_url + external_document_id FG22/5)',
    'Ingest live PDF from approved URL into regulatory-source-snapshots (content-addressed)',
    'Insert pdf_primary_v1 extraction revision (append-only)',
    'Do NOT attach FG22/5 citations to publication 56b0beca-…',
    'Do NOT modify Fair value html_article_v2 revision 613c078c-…',
  ],
  stagingExecutionBlockedUntil: 'explicit_user_authorisation_after_dry_run_review',
  expectedUatOutcome:
    'Ask RI Test A returns HTML citations from 56b0beca-… plus ≥2 pdf_primary_v1 page citations from FG22/5 publication only when indexed',
};

console.log(JSON.stringify(plan, null, 2));
