#!/usr/bin/env node
/**
 * Phase 2A.5: v2 (frozen) → v2.1 gold corrections. Does not modify v2 on disk except via this one-shot write to v2.1 path.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const V2 = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.json');
const V21 = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1.json');
const CHANGES_MD = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.1-changes.md');

const ANCHORS = {
  CP26: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
  CP26_PDF: 'c003a60a-eff8-4152-a2ce-47e20a206e29',
  CP26_HTML: '50197cc3-c7e7-4835-b566-f6174105eba2',
};

const PARTIAL_PASS_IDEAL_IDS = [
  'EVAL-B-02',
  'EVAL-C-01',
  'EVAL-C-05',
  'EVAL-D-02',
  'EVAL-D-03',
  'EVAL-D-04',
  'EVAL-D-05',
  'EVAL-E-01',
  'EVAL-E-02',
  'EVAL-E-03',
  'EVAL-E-04',
  'EVAL-F-01',
  'EVAL-F-03',
  'EVAL-F-05',
  'EVAL-G-03',
  'EVAL-G-04',
  'EVAL-H-02',
  'EVAL-H-03',
  'EVAL-H-05',
];

/** @type {Record<string, object>} */
const PATCHES = {
  'EVAL-C-04': {
    expectedResultClassification: 'ANSWERED',
    expectedRegulatoryStatus: 'consultation',
    evidenceAvailability: 'STAGING_OR_FIXTURE_PACK',
    expectedSourceVersions: [{ extractionRevisionId: ANCHORS.CP26_PDF }],
    expectedCitationSections: [
      {
        sourceDocument: 'cp26_primary_pdf',
        extractionRevisionId: ANCHORS.CP26_PDF,
        pages: [14],
        sectionLabel: 'Chapter 3 How to respond',
      },
    ],
    requiredAnswerThemes: [
      'consultation comments due by 24 December 2026',
      'consultation response deadline distinct from implementation or compliance dates',
    ],
    knownLimitations: ['Must not invent closing dates beyond indexed evidence'],
    prohibitedClaims: [
      'fabricated closing dates',
      '24 December 2026 as mandatory firm compliance implementation date',
      'binding compliance implementation date',
    ],
    expectedIdealResult: {
      responseState: 'ANSWERED',
      outcomeClassification: 'ANSWERED',
      requiresEvidenceGroundedAnswer: true,
      notes:
        'Frozen CP26/38 PDF p14 and HTML metadata both record consultation close 24 December 2026.',
    },
    currentEngineLimitations: [
      'Publication gate may block CP26 attachment when question names CP code without full gate phrase.',
      'May return insufficient despite indexed deadline in pack.',
    ],
    v1ExpectedResultClassification: 'CORRECT_INSUFFICIENT_EVIDENCE',
  },
  'EVAL-H-04': {
    expectedPublicationIds: [ANCHORS.CP26],
    expectedRegulatoryStatus: 'consultation',
    evidenceAvailability: 'STAGING_OR_FIXTURE_PACK',
    expectedSourceVersions: [{ extractionRevisionId: ANCHORS.CP26_PDF }],
    expectedCitationSections: [
      {
        sourceDocument: 'cp26_primary_pdf',
        extractionRevisionId: ANCHORS.CP26_PDF,
        pages: [6, 7, 8],
        sectionLabel: 'Chapter 2 proposed fraud changes (consultation narrative)',
      },
      {
        sourceDocument: 'cp26_primary_pdf',
        extractionRevisionId: ANCHORS.CP26_PDF,
        pages: [42, 43, 44],
        sectionLabel: 'Appendix 1 draft FCG fraud controls excerpt',
      },
    ],
    requiredAnswerThemes: [
      'authorised push payment (APP) fraud',
      'money mules and proceeds of fraud',
      'fraud monitoring and red flags',
      'onboarding and financial crime controls',
      'consultation / proposed guidance — not newly binding rules',
    ],
    prohibitedClaims: [
      'consultation proposals stated as binding rules',
      'binding obligation',
    ],
    expectedResultClassification: 'ANSWERED',
    expectedIdealResult: {
      responseState: 'ANSWERED',
      outcomeClassification: 'ANSWERED',
      requiresSemanticPublicationDiscovery: true,
      requiresEvidenceGroundedAnswer: true,
      mustNotPresentAsBinding: true,
      notes: 'Indexed CP26/38 fraud material supports substantive answer without explicit publication name.',
    },
    currentEngineLimitations: [
      'No semantic catalogue discovery; tenant path may misfire.',
      'Deterministic templates may omit draft FCG appendix content.',
    ],
    v1ExpectedResultClassification: 'CORRECT_INSUFFICIENT_EVIDENCE',
  },
  'EVAL-I-02': {
    expectedResultClassification: 'ANSWERED',
    requiredAnswerThemes: [
      'CP26/38 is a consultation paper not in-force binding law',
      'refute premise that CP26/38 alone imposes a legal compliance deadline',
      'distinguish existing MLR/FSMA obligations from proposed guide updates',
    ],
    prohibitedClaims: ['binding compliance date', 'fabricated implementation dates', 'must comply with CP26/38 by law'],
    expectedIdealResult: {
      responseState: 'ANSWERED',
      outcomeClassification: 'ANSWERED',
      idealScoringClassification: 'PASS_WITH_REFUTATION',
      mustRefuteFalsePremise: true,
      requiresEvidenceGroundedAnswer: true,
      notes: 'Answered refutation with consultation grounding — not insufficient silence.',
    },
    currentEngineLimitations: [
      'May return generic insufficient without explicit premise refutation.',
    ],
    v1ExpectedResultClassification: 'CORRECT_INSUFFICIENT_EVIDENCE',
  },
};

const PARTIAL_PASS_REVIEW_NOTES = {
  'EVAL-B-02':
    'Fair value evidence types supported in FG22/Fair Value HTML — ideal substantive ANSWERED.',
  'EVAL-C-01': 'CP26 PDF/HTML proposals support grounded summary + control mapping.',
  'EVAL-C-05': 'Both publications in pack; ideal ANSWERED with consultation vs finalised framing.',
  'EVAL-D-02': 'Named CP26; AML monitoring themes in indexed CP26 extract.',
  'EVAL-D-03': 'Named CP26; sanctions section in pack.',
  'EVAL-D-04': 'Named CP26; proliferation financing proposals in pack.',
  'EVAL-D-05': 'Named CP26; governance proposals in pack.',
  'EVAL-E-01': 'Applicability themes supported with consultation labelling.',
  'EVAL-E-02': 'Operational change themes from CP26 proposals.',
  'EVAL-E-03': 'Fair Value monitoring themes in HTML/PDF packs.',
  'EVAL-E-04': 'Organisational assessment themes from fair value guidance.',
  'EVAL-F-01': 'Tenant fixture supports substantive open-change summary (not counts-only).',
  'EVAL-F-03': 'Tenant graph links support control listing with context.',
  'EVAL-F-05': 'Missing-evidence narrative is ANSWERED with gaps, not gate failure.',
  'EVAL-G-03': 'Cross-publication compare ideal ANSWERED; quality graded by harness.',
  'EVAL-G-04': 'Catalogue+tenant fusion ideal ANSWERED; engine may partial on dimensions.',
  'EVAL-H-02': 'Semantic discovery should still produce evidence-grounded ANSWERED.',
  'EVAL-H-03': 'Semantic CP26 discovery supported in frozen pack.',
  'EVAL-H-05': 'Fair value insurer scope answerable from indexed guidance with caveats.',
};

function logChange(changes, row) {
  changes.push(row);
}

function applyPartialPassMigration(caseRow, changes) {
  if (!PARTIAL_PASS_IDEAL_IDS.includes(caseRow.testId)) return caseRow;
  const before = caseRow.expectedIdealResult?.outcomeClassification;
  if (before !== 'PARTIAL_PASS') return caseRow;
  const note = PARTIAL_PASS_REVIEW_NOTES[caseRow.testId] || 'Evidence supports substantive response.';
  const out = {
    ...caseRow,
    expectedIdealResult: {
      ...caseRow.expectedIdealResult,
      responseState: 'ANSWERED',
      outcomeClassification: 'ANSWERED',
      notes: `${caseRow.expectedIdealResult?.notes || ''} ${note}`.trim(),
    },
  };
  logChange(changes, {
    testId: caseRow.testId,
    field: 'expectedIdealResult.responseState',
    previous: before,
    revised: 'ANSWERED',
    reason: 'Separate ideal response state from harness PARTIAL_PASS grade.',
    publication: (out.expectedPublicationIds || []).join('; ') || '—',
    revision: 'frozen evidence packs',
    citation: 'see expectedCitationSections',
    scoringImpact: 'Yes — complete answers can reach PASS',
    referenceReviewStatus: 'PROVISIONAL',
  });
  return out;
}

function applyPatch(caseRow, changes) {
  const patch = PATCHES[caseRow.testId];
  if (!patch) return applyPartialPassMigration(caseRow, changes);
  const out = { ...caseRow, ...patch };
  if (patch.expectedIdealResult) {
    out.expectedIdealResult = { ...caseRow.expectedIdealResult, ...patch.expectedIdealResult };
  }
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'expectedIdealResult') continue;
    const prev = caseRow[field];
    const same = JSON.stringify(prev) === JSON.stringify(value);
    if (same) continue;
    logChange(changes, {
      testId: caseRow.testId,
      field,
      previous: prev == null ? '(null)' : typeof prev === 'object' ? JSON.stringify(prev) : String(prev),
      revised: typeof value === 'object' ? JSON.stringify(value) : String(value),
      reason: 'Phase 2A.5 factual / methodological gold correction',
      publication: ANCHORS.CP26,
      revision: ANCHORS.CP26_PDF,
      citation: field.includes('Citation') ? 'see patch' : '—',
      scoringImpact: 'Yes',
      referenceReviewStatus: 'PROVISIONAL',
    });
  }
  return applyPartialPassMigration(out, changes);
}

function buildMarkdown(changes) {
  const lines = [
    '# Ask RI evaluation suite v2 → v2.1 change log',
    '',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## Summary',
    '',
    '| Item | Detail |',
    '|------|--------|',
    '| Derived from | `ask-ri-v2-eval-suite-v2.json` (frozen) |',
    '| Factual fixes | EVAL-C-04 (consultation deadline), EVAL-H-04 (fraud controls), EVAL-I-02 (false premise) |',
    '| PARTIAL_PASS ideal review | 19 cases → `responseState: ANSWERED` |',
    '',
    'All regulatory expectations remain **PROVISIONAL**.',
    '',
    '| # | Evaluation ID | Field | Previous | Revised | Reason | Publication | Revision | Citation | Scoring | Review |',
    '|---|---------------|-------|----------|---------|--------|-------------|----------|----------|---------|--------|',
  ];
  changes.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | ${c.testId} | ${c.field} | ${String(c.previous).replace(/\|/g, '\\|').slice(0, 80)} | ${String(c.revised).replace(/\|/g, '\\|').slice(0, 80)} | ${c.reason} | ${c.publication} | ${c.revision} | ${c.citation} | ${c.scoringImpact} | ${c.referenceReviewStatus} |`,
    );
  });
  lines.push(
    '',
    '## Evidence anchors (verified frozen extract)',
    '',
    '- **C-04:** PDF physical page **14** — consultation comments due **24 December 2026**; HTML `closesDate` **24/12/2026**.',
    '- **H-04:** PDF pages **6–8** (APP fraud, money mules, monitoring); pages **42–44** (draft FCG fraud controls) — verified in `cp26-38-primary-pdf-v1.json`.',
    '- **I-02:** Consultation status in CP26 pack; no binding compliance date in extract.',
    '',
  );
  return lines.join('\n');
}

const v2 = JSON.parse(readFileSync(V2, 'utf8'));
const changes = [];
const cases = v2.cases.map((c) => {
  if (c.operatorHeldOut || c.reserved) return { ...c };
  return applyPatch({ ...c }, changes);
});

const v21 = {
  ...v2,
  evaluationVersion: 'ask-ri-v2-eval-suite-v2.1',
  schemaVersion: 2.1,
  createdAt: new Date().toISOString().slice(0, 10),
  scoringRubricVersion: 'ask-ri-v2-rubric-v2.1',
  datasetMetadata: {
    ...v2.datasetMetadata,
    title: 'FORGENIQ Ask RI V2 evaluation suite (gold-standard v2.1)',
    phase: '2A.5',
    derivedFrom: 'ask-ri-v2-eval-suite-v2',
    notes:
      'responseState separates ideal platform behaviour from harness PASS/PARTIAL/FAIL. PROVISIONAL references.',
  },
  schemaMigration: {
    backwardCompatibleWithSchemaVersion: 1,
    optionalFields: [
      'expectedIdealResult',
      'currentEngineLimitations',
      'v1ExpectedResultClassification',
      'expectedIdealResult.responseState',
      'expectedIdealResult.idealScoringClassification',
    ],
    v1FieldMapping: {
      expectedResultClassification: 'expectedIdealResult.responseState (when v2.1 present)',
      outcomeClassification: 'legacy; prefer responseState',
    },
  },
  cases,
};

writeFileSync(V21, JSON.stringify(v21, null, 2));
writeFileSync(CHANGES_MD, buildMarkdown(changes));
console.log(
  JSON.stringify({
    out: V21,
    changes: changes.length,
    partialPassMigrated: PARTIAL_PASS_IDEAL_IDS.length,
    patches: Object.keys(PATCHES).length,
  }),
);
