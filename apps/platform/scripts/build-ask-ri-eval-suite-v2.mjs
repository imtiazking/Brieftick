#!/usr/bin/env node
/**
 * One-shot builder: v1 suite → v2 gold-standard suite + change log metadata.
 * Does not modify v1 files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const V1 = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v1.json');
const V2 = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2.json');
const CHANGES_MD = join(REPO_ROOT, 'docs', 'eval', 'ask-ri-v2-eval-suite-v2-changes.md');

const ANCHORS = {
  FAIR: '56b0beca-d8c3-4267-a794-9079009af661',
  FAIR_HTML: '613c078c-3639-4ce5-9666-73c5352f44fd',
  FG22: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
  FG22_PDF: '56fd1525-7f30-401e-82fd-16abf90100aa',
  CP26: '4d05b49b-a4a4-4101-8c87-7d3983315f25',
  CP26_HTML: '50197cc3-c7e7-4835-b566-f6174105eba2',
  CP26_PDF: 'c003a60a-eff8-4152-a2ce-47e20a206e29',
};

/** @type {Record<string, object>} */
const PATCHES = {
  'EVAL-A-01': {
    expectedIdealResult: {
      outcomeClassification: 'ANSWERED',
      requiresEvidenceGroundedAnswer: true,
      requiresSemanticPublicationDiscovery: false,
      notes: 'Named FCA webpage title should resolve to Fair value catalogue HTML without quoted-title gate.',
    },
    currentEngineLimitations: [
      'Publication gate may not treat unquoted webpage title as catalogue-scoped (tenant path or insufficient).',
      'Deterministic HTML synthesis may omit themes.',
    ],
    v1ExpectedResultClassification: 'ANSWERED',
  },
  'EVAL-A-04': {
    expectedIdealResult: {
      outcomeClassification: 'ANSWERED',
      requiresSemanticPublicationDiscovery: true,
      notes: 'Supervisory webpage should resolve via title/semantic match.',
    },
    currentEngineLimitations: ['questionMentionsPublicationReference may be false without explicit publication phrase.'],
    v1ExpectedResultClassification: 'ANSWERED',
  },
  'EVAL-B-02': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresEvidenceGroundedAnswer: true,
      notes: 'Evidence-backed documentation themes from HTML/PDF, not generic templates.',
    },
    currentEngineLimitations: ['Template synthesis may not enumerate evidence types without explicit passages.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-C-01': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresControlImpactReasoning: true,
      notes: 'Grounded summary of proposals plus reasoned (labelled) control-impact implications from CP26 PDF/HTML.',
    },
    currentEngineLimitations: [
      'Deterministic PDF template weak on financial-crime control mapping.',
      'May surface unrelated uncertainties from other publications.',
    ],
    expectedPublicationIds: [ANCHORS.CP26],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-E-01': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresControlImpactReasoning: true,
    },
    currentEngineLimitations: ['inferApplicability labels only; limited narrative synthesis.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-E-02': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresReasonedImplications: true,
      mustNotPresentAsBinding: true,
    },
    currentEngineLimitations: ['No structured reasoned-implication composer.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-F-01': {
    expectedResultClassification: 'PARTIAL_PASS',
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSubstantiveTenantAnswer: true,
      notes: 'Ideal: summarise open changes with regulatory context; not only record IDs/counts.',
    },
    currentEngineLimitations: ['Deterministic tenant path returns record counts or ID lists.'],
    v1ExpectedResultClassification: 'ANSWERED',
  },
  'EVAL-F-02': {
    expectedIdealResult: {
      outcomeClassification: 'ANSWERED',
      requiresSubstantiveTenantAnswer: true,
      notes: 'Count acceptable if predicate-complete and accurate.',
    },
    currentEngineLimitations: ['Numeric count answer only when graph predicate resolves.'],
    v1ExpectedResultClassification: 'ANSWERED',
  },
  'EVAL-F-03': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSubstantiveTenantAnswer: true,
      notes: 'Linked controls with obligation context.',
    },
    currentEngineLimitations: ['Graph retrieval without narrative synthesis.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-F-04': {
    expectedIdealResult: { outcomeClassification: 'ANSWERED', requiresSubstantiveTenantAnswer: true },
    currentEngineLimitations: ['Record listing without interpretation.'],
    v1ExpectedResultClassification: 'ANSWERED',
  },
  'EVAL-F-05': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSubstantiveTenantAnswer: true,
      notes: 'Explicit missing-evidence gaps per obligation.',
    },
    currentEngineLimitations: ['Limited missing-evidence narrative.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-G-03': {
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresMultiPublicationCompare: true,
      notes: 'Status-aware comparison CP26 consultation vs FG22 finalised guidance.',
    },
    currentEngineLimitations: ['No production cross-publication compare composer.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-G-04': {
    expectedResultClassification: 'PARTIAL_PASS',
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresCatalogueAndTenantFusion: true,
      notes: 'CP26 citations plus tenant obligation records in one answer.',
    },
    currentEngineLimitations: ['Catalogue and tenant branches mutually exclusive in runAskRiDeterministic.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS',
  },
  'EVAL-H-01': {
    expectedResultClassification: 'ANSWERED',
    expectedPublicationIds: [ANCHORS.FAIR, ANCHORS.FG22],
    expectedIdealResult: {
      outcomeClassification: 'ANSWERED',
      requiresSemanticPublicationDiscovery: true,
      requiresEvidenceGroundedAnswer: true,
      notes: 'Semantic discovery should attach Fair Value HTML and/or FG22 PDF from indexed catalogue.',
    },
    currentEngineLimitations: [
      'questionMentionsPublicationReference false → catalogue packs not attached in production/harness gate simulation.',
    ],
    v1ExpectedResultClassification: 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED',
  },
  'EVAL-H-02': {
    expectedResultClassification: 'PARTIAL_PASS',
    expectedPublicationIds: [ANCHORS.FAIR, ANCHORS.FG22],
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSemanticPublicationDiscovery: true,
      requiresEvidenceGroundedAnswer: true,
    },
    currentEngineLimitations: ['Publication gate blocks catalogue without explicit reference.'],
    v1ExpectedResultClassification: 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED',
  },
  'EVAL-H-03': {
    expectedResultClassification: 'PARTIAL_PASS',
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSemanticPublicationDiscovery: true,
      notes: 'Should discover CP26/38 or relevant FC consultation in catalogue.',
    },
    currentEngineLimitations: ['No semantic catalogue search.'],
    v1ExpectedResultClassification: 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED',
  },
  'EVAL-H-04': {
    expectedIdealResult: {
      outcomeClassification: 'CORRECT_INSUFFICIENT_EVIDENCE',
      notes: 'No indexed publication in frozen packs for generic retail fraud question.',
    },
    currentEngineLimitations: ['Tenant graph may return unrelated records if misparsed.'],
    v1ExpectedResultClassification: 'CORRECT_INSUFFICIENT_EVIDENCE',
  },
  'EVAL-H-05': {
    expectedResultClassification: 'PARTIAL_PASS',
    expectedIdealResult: {
      outcomeClassification: 'PARTIAL_PASS',
      requiresSemanticPublicationDiscovery: true,
      notes: 'Sector-aware fair value guidance with caveats for insurers.',
    },
    currentEngineLimitations: ['Weak sector scoping; publication gate.'],
    v1ExpectedResultClassification: 'PARTIAL_PASS_OR_UNRESOLVED',
  },
  'EVAL-J-01': {
    expectedIdealResult: {
      outcomeClassification: 'PASS_WITH_REFUTATION',
      mustRefuteFalsePremise: true,
    },
    currentEngineLimitations: ['May not explicitly refute false premise in template answers.'],
    v1ExpectedResultClassification: 'PASS_WITH_REFUTATION',
  },
  'EVAL-J-02': {
    expectedIdealResult: {
      outcomeClassification: 'PASS_WITH_REFUTATION',
      mustRefuteFalsePremise: true,
    },
    currentEngineLimitations: ['Consultation status may be unclear in templates.'],
    v1ExpectedResultClassification: 'PASS_WITH_REFUTATION',
  },
};

function defaultIdeal(caseRow) {
  return {
    outcomeClassification: caseRow.expectedResultClassification || 'ANSWERED',
    requiresEvidenceGroundedAnswer: !String(caseRow.expectedResultClassification || '').includes('INSUFFICIENT'),
  };
}

function applyPatch(caseRow) {
  const patch = PATCHES[caseRow.testId];
  const out = { ...caseRow };
  const v1Class = caseRow.expectedResultClassification;
  if (patch) {
    Object.assign(out, patch);
    if (patch.expectedResultClassification) {
      out.expectedResultClassification = patch.expectedResultClassification;
    }
    out.v1ExpectedResultClassification = patch.v1ExpectedResultClassification ?? v1Class;
  } else {
    out.v1ExpectedResultClassification = v1Class;
    out.currentEngineLimitations = [
      ...(caseRow.knownLimitations || []),
      ...(out.currentEngineLimitations || []),
    ].filter(Boolean);
    if (!out.currentEngineLimitations.length) {
      out.currentEngineLimitations = ['None documented beyond deterministic template limits.'];
    }
    out.expectedIdealResult = defaultIdeal(caseRow);
  }
  if (!out.expectedIdealResult) {
    out.expectedIdealResult = defaultIdeal(out);
  }
  out.referenceReviewStatus = caseRow.referenceReviewStatus || 'PROVISIONAL';
  return out;
}

function buildChangesMarkdown(changes) {
  const lines = [
    '# Ask RI evaluation suite v2 — change log',
    '',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'All regulatory reference expectations remain **PROVISIONAL** unless marked otherwise.',
    '',
    '| # | Evaluation ID | Field | Original (v1) | Revised (v2) | Reason | Publication | Revision | Citation anchor | Scoring affected | Provisional |',
    '|---|---------------|-------|---------------|--------------|--------|-------------|----------|-----------------|------------------|-------------|',
  ];
  changes.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | ${c.testId} | ${c.field} | ${c.original} | ${c.revised} | ${c.reason} | ${c.publication} | ${c.revision} | ${c.citation} | ${c.scoring} | ${c.provisional} |`,
    );
  });
  lines.push('', '## Schema (backward compatible)', '');
  lines.push('- v1 fields retained.');
  lines.push('- Optional: `expectedIdealResult`, `currentEngineLimitations`, `v1ExpectedResultClassification`.');
  lines.push('- Harness scores against `expectedIdealResult.outcomeClassification` when present, else `expectedResultClassification`.');
  lines.push('');
  lines.push('## Source authenticity', '');
  lines.push('- Answer accuracy is judged against **frozen extraction packs** in `docs/eval/evidence-packs/` (staging revisions).');
  lines.push('- Currency vs live FCA URLs is a separate authenticity check — not re-run per case in this log.');
  lines.push('');
  return lines.join('\n');
}

const v1 = JSON.parse(readFileSync(V1, 'utf8'));
const changes = [];
const v2Cases = v1.cases.map((c) => {
  if (c.operatorHeldOut) return { ...c };
  const before = { ...c };
  const after = applyPatch(c);
  if (PATCHES[c.testId]) {
    const p = PATCHES[c.testId];
    if (p.expectedResultClassification && p.expectedResultClassification !== before.expectedResultClassification) {
      changes.push({
        testId: c.testId,
        field: 'expectedResultClassification',
        original: before.expectedResultClassification,
        revised: p.expectedResultClassification,
        reason: 'Align scored ideal with platform capability, not current gate failure.',
        publication: (after.expectedPublicationIds || []).join('; ') || '—',
        revision: 'see expectedSourceVersions',
        citation: 'see expectedCitationSections',
        scoring: 'Yes',
        provisional: 'Yes',
      });
    }
    if (p.expectedIdealResult) {
      changes.push({
        testId: c.testId,
        field: 'expectedIdealResult',
        original: '(absent)',
        revised: JSON.stringify(p.expectedIdealResult.outcomeClassification),
        reason: 'Gold-standard ideal behaviour decoupled from engine quirks.',
        publication: (after.expectedPublicationIds || []).join('; ') || '—',
        revision: '—',
        citation: '—',
        scoring: 'Yes (primary target)',
        provisional: 'Yes',
      });
    }
    if (p.currentEngineLimitations) {
      changes.push({
        testId: c.testId,
        field: 'currentEngineLimitations',
        original: (before.knownLimitations || []).join('; ') || '(sparse)',
        revised: p.currentEngineLimitations.join('; '),
        reason: 'Document deterministic v1 gaps without lowering ideal bar.',
        publication: '—',
        revision: '—',
        citation: '—',
        scoring: 'No (informational)',
        provisional: 'N/A',
      });
    }
    if (p.v1ExpectedResultClassification) {
      changes.push({
        testId: c.testId,
        field: 'v1ExpectedResultClassification',
        original: before.expectedResultClassification,
        revised: p.v1ExpectedResultClassification,
        reason: 'Preserve v1 comparison label.',
        publication: '—',
        revision: '—',
        citation: '—',
        scoring: 'No',
        provisional: 'N/A',
      });
    }
    if (p.expectedPublicationIds) {
      changes.push({
        testId: c.testId,
        field: 'expectedPublicationIds',
        original: JSON.stringify(before.expectedPublicationIds),
        revised: JSON.stringify(p.expectedPublicationIds),
        reason: 'Ideal semantic discovery should select these catalogue publications.',
        publication: p.expectedPublicationIds.join('; '),
        revision: 'staging pack IDs',
        citation: '—',
        scoring: 'Yes (D02)',
        provisional: 'Yes',
      });
    }
  } else if (!c.operatorHeldOut && !c.reserved) {
    changes.push({
      testId: c.testId,
      field: '(metadata only)',
      original: 'v1 case',
      revised: 'expectedIdealResult + currentEngineLimitations',
      reason: 'v1 expectation already ideal-oriented; added explicit ideal/limitation split.',
      publication: (after.expectedPublicationIds || []).join('; ') || '—',
      revision: '—',
      citation: '—',
      scoring: 'Minimal',
      provisional: 'Yes',
    });
  }
  return after;
});

const v2 = {
  ...v1,
  evaluationVersion: 'ask-ri-v2-eval-suite-v2',
  schemaVersion: 2,
  createdAt: new Date().toISOString().slice(0, 10),
  datasetMetadata: {
    ...v1.datasetMetadata,
    title: 'FORGENIQ Ask RI V2 regulatory accuracy evaluation suite (gold-standard v2)',
    phase: '2A.4',
    derivedFrom: 'ask-ri-v2-eval-suite-v1',
    derivedFromCommit: 'a81c6d2f66548ffe10c7db0c6b2fb57841081452',
    notes:
      'Scores ideal regulatory intelligence behaviour. v1 suite frozen for historical comparison. PROVISIONAL references.',
  },
  scoringRubricVersion: 'ask-ri-v2-rubric-v2',
  cases: v2Cases,
  schemaMigration: {
    backwardCompatibleWithSchemaVersion: 1,
    optionalFields: ['expectedIdealResult', 'currentEngineLimitations', 'v1ExpectedResultClassification'],
    v1FieldMapping: {
      expectedResultClassification: 'expectedIdealResult.outcomeClassification (when v2 present)',
    },
  },
};

writeFileSync(V2, JSON.stringify(v2, null, 2));
writeFileSync(CHANGES_MD, buildChangesMarkdown(changes));
console.log(
  JSON.stringify({
    v2,
    changes: changes.length,
    patched: Object.keys(PATCHES).length,
    reviewed: v2Cases.filter((c) => !c.operatorHeldOut).length,
  }),
);
