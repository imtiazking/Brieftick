#!/usr/bin/env node
/**
 * Authoritative identity verification for PS22/9 primary PDF fixture (SHA256, cover text, FCA metadata).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

const PDF = join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf');
const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-SOURCE-PUBLICATION-VERIFICATION-2026-11-23.json');
const EXPECTED_SHA = 'ee1230a9d9dfc378604ea9462568817cf6c1e7702ab38e927027fe08172f637b';

const buf = readFileSync(PDF);
const sha256 = createHash('sha256').update(buf).digest('hex');
const extracted = await extractRegulatoryPdfContent(buf);
const pages = extracted.structured?.pages || extracted.structured || [];
const pageList = Array.isArray(pages) ? pages : Object.values(pages);
const fullText = pageList.map((p) => p.text || p.extractedText || '').join('\n');

const cover = pageList.slice(0, 6).map((p) => ({
  pageNumber: p.pageNumber ?? p.page,
  head: String(p.text || p.extractedText || '').slice(0, 1200),
}));

const coverBlob = cover.map((c) => c.head).join('\n');
const signals = {
  ps22_9:
    /PS\s*22\s*\/\s*9/i.test(fullText) ||
    /PolicyStatement\s*PS\s*22\s*\/\s*9/i.test(coverBlob) ||
    /PolicyStatementPS22\/9/i.test(coverBlob),
  cp22_9: /\bCP\s*22\s*\/\s*0?9\b/i.test(fullText),
  cp21_36: /\bCP\s*21\s*\/\s*36\b/i.test(fullText),
  policyStatement: /policy statement/i.test(fullText),
  consultationPaper: /consultation paper/i.test(fullText),
  consumerDuty: /consumer duty/i.test(fullText),
  madeRules: /made rules|legal instrument|INSTRUMENT 20/i.test(fullText),
  july2022: /July\s+2022|29\s+July\s+2022/i.test(fullText),
  prin2a: /\bPRIN\s*2A\b/i.test(fullText),
  prin2_2_14: /2A\.2\.14\s*R/i.test(fullText),
  prin2_2_26: /2A\.2\.26\s*R/i.test(fullText),
};

const metadataPolicyStatement = {
  publicationType: 'policy_statement',
  publicationTypeLabel: 'Policy Statement',
  title: 'PS22/9: A new Consumer Duty',
  canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
};
const metadataWrongConsultation = {
  publicationType: 'consultation_paper',
  publicationTypeLabel: 'Consultation Paper',
  title: 'CP22/9',
};

const analysisCorrect = analyzeRegulatoryPdfDocument({
  structured: { pages: pageList.map((p) => ({ text: p.text || p.extractedText || '', pageNumber: p.pageNumber })) },
  publicationMetadata: metadataPolicyStatement,
  canonicalUrl: metadataPolicyStatement.canonicalUrl,
});
const analysisBare = analyzeRegulatoryPdfDocument({
  structured: { pages: pageList.map((p) => ({ text: p.text || p.extractedText || '' })) },
  publicationMetadata: {},
  canonicalUrl: '',
});

const publicationIdentity = {
  fcaReference: signals.ps22_9 ? 'PS22/9' : signals.cp22_9 ? 'CP22/9 (text signal — investigate)' : 'UNRESOLVED',
  officialTitle: 'A new Consumer Duty',
  canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
  publicationDate: META.publicationDate,
  publicationDateAuthority: META.canonicalPublicationPage,
  pdfCoverDateText: META.pdfCoverDateText,
  priorIncorrectPublicationDate: META.priorIncorrectPublicationDate,
  commencement: META.commencement,
  publicationType: 'policy_statement',
  documentContains: signals.madeRules ? 'final_policy_statement_with_made_rules' : 'unknown',
  rulesCharacter: 'Final rules as made in PS22/9 instrument (not a standalone consultation paper PDF)',
  cp21_36Mentioned: signals.cp21_36,
  enactmentNote:
    'PRIN 2A Consumer Duty rules were made via PS22/9; Handbook status is binding for in-scope firms subject to applicability and commencement provisions in the instrument.',
  effectiveDates: 'Derived from instrument / Handbook commencement — not inferred from R suffix alone',
};

const defect =
  signals.cp22_9 && !signals.ps22_9
    ? 'WRONG_DOCUMENT'
    : analysisCorrect.consultationPreserved
      ? 'CLASSIFICATION_DEFECT'
      : analysisCorrect.publicationClassification.primaryClass !== 'policy_statement'
        ? 'METADATA_CLASSIFICATION_MISMATCH'
        : null;

const report = {
  generatedAt: new Date().toISOString(),
  publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831',
  fixturePath: PDF,
  sha256,
  expectedSha256: EXPECTED_SHA,
  sha256Match: sha256 === EXPECTED_SHA,
  byteLength: buf.length,
  coverExcerpts: cover,
  textSignals: signals,
  publicationIdentity,
  regulatoryAnalysis: {
    withPolicyStatementMetadata: analysisCorrect,
    withoutMetadata: analysisBare,
  },
  identifiedDefect: defect,
  priorIncorrectAssessment:
    'PS22-9-PUBLICATION-LEGAL-STATUS-ASSESSMENT incorrectly labelled CP22/9 consultation; corrected in this verification.',
  handbookProvisionsFocus: {
    'PRIN 2A.2.14R': {
      currentHandbookStatus: 'binding_rule_if_enacted_via_PS22_9',
      originalPublicationStatus: 'final_rule_in_PS22_9_instrument',
      mustNotInferFromSuffixAlone: true,
    },
    'PRIN 2A.2.26R': {
      currentHandbookStatus: 'binding_rule_if_enacted_via_PS22_9',
      originalPublicationStatus: 'final_rule_in_PS22_9_instrument',
      mustNotInferFromSuffixAlone: true,
    },
  },
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, sha256Match: report.sha256Match, identity: publicationIdentity.fcaReference, defect }, null, 2));
if (!report.sha256Match) process.exit(1);