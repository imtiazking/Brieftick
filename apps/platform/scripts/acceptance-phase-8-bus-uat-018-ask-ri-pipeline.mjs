#!/usr/bin/env node
/**
 * BUS-UAT-018 — Ask RI pipeline integration (attach + planner), offline mocks only.
 * Does not claim live staging HTML retrieval.
 */
import { attachPublicationPdfEvidenceToAskRiState } from '../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { buildAskRiEvidenceTrace } from '../lib/ri/ask-ri/ask-ri-trace.mjs';
import {
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
} from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import {
  questionRequestsPdfSupplement,
  FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
} from '../lib/ri/ask-ri/publication-question-scope.mjs';

const HTML_ONLY_QUESTION =
  "Using only the FCA webpage 'Fair value in consumer finance', explain what it says about Consumer Duty fair-value assessments. Provide citations to the original webpage and its relevant sections. Do not use PDF sources or invent regulatory deadlines.";

const fairValueText =
  'Fair value in consumer finance.\n\nFirms should deliver fair value under Consumer Duty (PRIN 2A.4). See FG22/5 Chapter 7.\n\nExample of good practice: documented fair value assessments.';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

if (!questionRequestsPdfSupplement(HTML_ONLY_QUESTION)) pass('HTML-only question does not request PDF supplement');
else failMsg('HTML-only question must not request PDF');

if (questionRequestsPdfSupplement(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION)) {
  pass('combined question requests PDF supplement');
} else failMsg('combined question should request PDF supplement');

function mockAdmin() {
  const revisionRow = {
    id: 'rev-mock-html',
    publication_id: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
    source_snapshot_id: 'snap-1',
    extraction_profile: 'html_article_v2',
    raw_content_sha256: 'a'.repeat(64),
    normalised_html_sha256: 'b'.repeat(64),
    normalised_text_sha256: 'c'.repeat(64),
    normalised_html_storage_path: 'html/path',
    normalised_text_storage_path: 'text/path',
    derived_metadata_storage_path: 'meta/path',
    extraction_quality: { webpageExtraction: { status: 'complete' } },
    publication_metadata: { title: 'Fair value in consumer finance' },
    pdf_attachments: [],
  };

  return {
    from(table) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        in() {
          return api;
        },
        or() {
          return api;
        },
        ilike() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        async then(resolve) {
          if (table === 'regulatory_publications') {
            resolve({
              data: [
                {
                  id: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
                  title: 'Fair value in consumer finance',
                  canonical_url:
                    'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
                  external_document_id: 'fair-value',
                  regulator: { acronym: 'FCA', name: 'Financial Conduct Authority' },
                },
              ],
              error: null,
            });
            return;
          }
          if (table === 'regulatory_source_extraction_revisions') {
            resolve({ data: [revisionRow], error: null });
            return;
          }
          if (table === 'regulatory_publication_versions') {
            resolve({
              data: [{ id: 'ver-1', publication_id: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID, version_number: 4 }],
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return api;
    },
  };
}

// Patch storage download for attach path — inject evidence by bypassing attach and testing planner with prebuilt state
const htmlEvidence = {
  publicationId: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
  extractionRevisionId: 'rev-mock-html',
  extractionProfile: 'html_article_v2',
  evidenceMedium: 'fca_webpage',
  publicationTitle: 'Fair value in consumer finance',
  publicationReference: 'fair-value',
  regulatorShortName: 'FCA',
  regulatorLabel: 'Financial Conduct Authority',
  canonicalUrl: 'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
  integrityVerified: true,
  extractionQuality: { webpageExtraction: { status: 'complete' } },
  normalisedArticleText: fairValueText,
  evidenceBlocks: [
    {
      documentEvidenceId: 'blk-1',
      sectionReference: 'Article body',
      extractedText: fairValueText,
      evidenceKind: 'webpage_narrative',
    },
  ],
  pdfAttachments: [],
};

const state = {
  publicationHtmlEvidence: [htmlEvidence],
  publicationHtmlEvidenceErrors: [],
  publicationPdfEvidence: [],
  publicationPdfEvidenceErrors: [{ code: 'revision_query_zero_rows' }],
  publicationPdfEvidenceLoadMeta: {
    scopedPublicationIds: [FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID],
    htmlLoadedCount: 1,
    pdfLoadedCount: 0,
  },
};

const htmlOnly = runAskRiDeterministic(state, HTML_ONLY_QUESTION);
if (htmlOnly.status === 'ANSWERED' && htmlOnly.citations?.length >= 1) pass('pipeline HTML-only ANSWERED');
else failMsg(`HTML-only pipeline ${htmlOnly.status} citations ${htmlOnly.citations?.length ?? 0}`);

if (!String(htmlOnly.answer || '').includes('pdf_primary_v1 revision is indexed')) {
  pass('HTML-only answer not replaced by PDF-missing boilerplate');
} else failMsg('PDF-missing boilerplate leaked into HTML-only answer');

const combined = runAskRiDeterministic(state, CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (combined.status === 'ANSWERED' && combined.citations?.length >= 1) {
  pass('pipeline combined question keeps HTML ANSWERED without PDF');
} else failMsg(`combined pipeline ${combined.status}`);

const trace = buildAskRiEvidenceTrace(state, htmlOnly);
if (trace.htmlRevisionQuery.loadedCount === 1) pass('trace reports loaded html evidence');
else failMsg('trace html loaded count');

// Resolve path smoke (mock returns publication by title without throwing)
const admin = mockAdmin();
const preState = {};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2UiLCJyZWYiOiJleGFtcGxlIn0.x';
try {
  await attachPublicationPdfEvidenceToAskRiState(preState, admin, HTML_ONLY_QUESTION);
  if (preState.publicationPdfEvidenceLoadMeta?.scopedPublicationIds?.includes(FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID)) {
    pass('attach resolves fair value publication id');
  } else failMsg('attach resolve failed');
} catch (e) {
  failMsg(`attach threw ${e.message}`);
}

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-ask-ri-pipeline: PASS (offline mocks)\n');
