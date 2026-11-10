#!/usr/bin/env node
/**
 * BUS-UAT-018 — FG22/5 controlled ingest safeguards (offline; no DB writes).
 */
import { assessFg22ControlledIngestSafety } from '../lib/ri/ingestion/snapshot/fg22-5-controlled-ingest-safety.mjs';
import { FG22_5_EXPECTED_PRIMARY_PDF_SHA256 } from '../lib/ri/ingestion/snapshot/fg22-5-landing-resolve.mjs';
import { FG22_5_STAGING } from '../lib/ri/ingestion/snapshot/fg22-5-staging-identity.mjs';
import {
  assertApprovedPrimaryPdfUrl,
  FCA_PUBLICATIONS_RSS_SOURCE_KEY,
  FG22_5_PRIMARY_PDF_URL,
} from '../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const disabled = assessFg22ControlledIngestSafety({ ingestion_mode: 'DISABLED', monitoring_enabled: true });
if (!disabled.executeAllowed && disabled.reason === 'fca_ingestion_mode_disabled') {
  pass('DISABLED blocks execute (runSourceIngestion eligibility)');
} else failMsg('DISABLED safety');

const enabled = assessFg22ControlledIngestSafety({ ingestion_mode: 'ENABLED', monitoring_enabled: true });
if (enabled.executeAllowed && enabled.overall === 'SAFE_WITH_GUARDS') {
  pass('ENABLED allows controlled execute with mitigations documented');
} else failMsg('ENABLED safety');

const urlCheck = assertApprovedPrimaryPdfUrl(FCA_PUBLICATIONS_RSS_SOURCE_KEY, FG22_5_PRIMARY_PDF_URL);
if (urlCheck.ok) pass('FG22 PDF on allowlist');
else failMsg('allowlist');

if (FG22_5_EXPECTED_PRIMARY_PDF_SHA256.length === 64) pass('expected PDF sha present');
else failMsg('pdf sha');

if (
  FG22_5_STAGING.fairValuePublicationId === '56b0beca-d8c3-4267-a794-9079009af661' &&
  FG22_5_STAGING.externalDocumentId === 'FG22/5'
) {
  pass('FG22 ingest constants isolated from Fair value publication id');
} else failMsg('identity separation');

if (FG22_5_STAGING.externalDocumentId === 'FG22/5') pass('external_document_id FG22/5');
else failMsg('external id');

process.exitCode = fail ? 1 : 0;
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');
