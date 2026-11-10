#!/usr/bin/env node
/**
 * BUS-UAT-018 — FG22 discovery HTML append-only recovery and fail-closed classification.
 */
import {
  applyFg22DiscoveryHtmlRevisionSemantics,
  assessFg22PartialIngestRecovery,
  buildFg22DiscoveryInsertFields,
  classifyFg22HtmlArticleV2Evidence,
} from '../lib/ri/ingestion/snapshot/fg22-discovery-html-evidence.mjs';
import { FG22_5_STAGING } from '../lib/ri/ingestion/snapshot/fg22-5-staging-identity.mjs';
import { FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID } from '../lib/ri/ask-ri/publication-question-scope.mjs';
import { assessObligationGradePosture } from '../lib/ri/ingestion/snapshot/obligation-grade-policy.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const insertFields = buildFg22DiscoveryInsertFields();
if (
  insertFields.extractionQuality?.obligationGradeSuitable === false &&
  insertFields.extractionQuality?.htmlSnapshotRole === 'fca_link_discovery_only'
) {
  pass('insert fields mark discovery-only and obligationGradeSuitable false');
} else failMsg('insert fields');

try {
  await applyFg22DiscoveryHtmlRevisionSemantics();
  failMsg('applyFg22DiscoveryHtmlRevisionSemantics must throw (no UPDATE)');
} catch (e) {
  if (String(e.message).includes('insert_only')) pass('post-insert UPDATE helper rejected');
  else failMsg(`apply throw message: ${e.message}`);
}

const fg22Pub = {
  external_document_id: 'FG22/5',
  canonical_url: FG22_5_STAGING.canonicalPdfUrl,
  title: FG22_5_STAGING.title,
};
const hubSnap = {
  canonical_url: 'https://www.fca.org.uk/firms/consumer-duty/publications-resources',
};
const unstampedRev = { extraction_quality: { obligationGradeSuitable: true } };
const unstampedClass = classifyFg22HtmlArticleV2Evidence(fg22Pub, hubSnap, unstampedRev);
if (unstampedClass.discoveryOnly && unstampedClass.code === 'html_discovery_index_not_substantive') {
  pass('unstamped FG22 html classified discovery-only by publication+hub snapshot identity');
} else failMsg('unstamped FG22 classification');

const fairValuePub = {
  id: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
  external_document_id: 'fair-value',
  canonical_url: 'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
  title: 'Fair value in consumer finance',
};
const fairHtmlClass = classifyFg22HtmlArticleV2Evidence(fairValuePub, null, {
  extraction_quality: { obligationGradeSuitable: true },
});
if (!fairHtmlClass.discoveryOnly) pass('Fair Value HTML not suppressed by FG22 identity rule');
else failMsg('Fair Value must remain substantive html_article_v2');

const fg22Obligation = assessObligationGradePosture(
  { obligationGradeSuitable: true, webpageExtraction: { status: 'complete', confidence: 'high' } },
  { primaryDocument: { completeness: 'captured', extractionStatus: 'complete' } },
  { evidenceBlocksCount: 5, findingsWithAnchors: 2, consultationPreserved: true, humanReviewStatus: 'approved_for_obligation_use' },
  {
    publication: fg22Pub,
    snapshot: hubSnap,
    revisionRow: unstampedRev,
  },
);
if (fg22Obligation.fg22DiscoveryHtmlBlocked && fg22Obligation.obligationGradeSuitable === false) {
  pass('obligation-grade posture blocks unstamped FG22 discovery HTML');
} else failMsg('obligation-grade FG22 block');

const stampedClass = classifyFg22HtmlArticleV2Evidence(fg22Pub, null, {
  publication_metadata: { htmlSnapshotRole: 'fca_link_discovery_only' },
});
if (stampedClass.discoveryOnly && stampedClass.classificationSource === 'revision_metadata') {
  pass('stamped metadata shortcut still works');
} else failMsg('stamped metadata');

const partialPlan = await assessFg22PartialIngestRecovery(
  {
    query: async (sql) => {
      if (sql.includes('from regulatory_publications where id')) {
        return {
          rows: [
            {
              id: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
              title: fg22Pub.title,
              canonical_url: fg22Pub.canonical_url,
              external_document_id: 'FG22/5',
              source_hash: FG22_5_STAGING.expectedPrimaryPdfSha256,
              source_version: '1',
            },
          ],
        };
      }
      if (sql.includes('from regulatory_source_snapshots where id')) {
        return {
          rows: [
            {
              id: '0b87a78e-c672-4772-acc1-5b307f2dab47',
              publication_id: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
              canonical_url: hubSnap.canonical_url,
              source_fingerprint: FG22_5_STAGING.expectedPrimaryPdfSha256,
            },
          ],
        };
      }
      if (sql.includes("extraction_profile = 'html_article_v2'")) {
        return {
          rows: [
            {
              id: 'dd415a21-8c91-44cc-baff-6d021db9c680',
              extraction_profile: 'html_article_v2',
              extraction_quality: { obligationGradeSuitable: true },
            },
          ],
        };
      }
      if (sql.includes("extraction_profile = 'pdf_primary_v1'")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  },
  {
    expectedPublicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
    expectedSnapshotId: '0b87a78e-c672-4772-acc1-5b307f2dab47',
  },
);

if (partialPlan.readyForPdfOnlyContinuation) {
  pass('partial ingest recovery targets pdf_primary_v1 continuation');
} else failMsg('partial recovery plan');

const htmlAction = partialPlan.recoveryActions.find((a) => a.step === 'html_article_v2');
const pdfAction = partialPlan.recoveryActions.find((a) => a.step === 'pdf_primary_v1');
if (htmlAction?.action === 'SKIP' && pdfAction?.action === 'INSERT') {
  pass('recovery preserves html revision and inserts pdf only');
} else failMsg('recovery actions');

if (partialPlan.forbiddenOperations?.some((op) => /UPDATE/.test(op))) {
  pass('recovery documents forbidden UPDATE on extraction revisions');
} else failMsg('forbidden ops');

process.exitCode = fail ? 1 : 0;
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
