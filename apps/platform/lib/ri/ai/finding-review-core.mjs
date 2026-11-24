/**
 * UC-RI-005 per-finding review: finding view, suggested evidence and payload validation.
 * Mirrors the checks in public.ri_submit_ai_finding_review, which remains authoritative.
 */
import { createHash } from 'node:crypto';
import {
  CANONICAL_CLASSIFICATION_CODES,
  DISPOSITIONS,
  QUEUE_ACTIONS,
  conversionRefusal,
  evaluateFindingTriage,
  modelLabelsForFinding,
  policyEntry,
  TRIAGE_QUEUES,
} from '../classification/regulatory-classification-policy.mjs';
import {
  PROVISION_FUNCTIONS,
  parseProvisionReference,
  buildProvisionPagesIndex,
} from '../classification/provision-eligibility.mjs';

/** Rebuild provisionPageIndex from stored section catalog when older runs omitted it (RI-CLS-009). */
export function provisionPageIndexFromCatalog(catalog, existing = {}) {
  if (existing && typeof existing === 'object' && Object.keys(existing).length) return existing;
  const sections = Array.isArray(catalog) ? catalog : [];
  const instrumentStart = sections.reduce((min, s) => {
    if (s?.inLegalInstrument !== true || !Number.isInteger(s.pageNumber)) return min;
    return min == null ? s.pageNumber : Math.min(min, s.pageNumber);
  }, null);
  if (!Number.isInteger(instrumentStart)) return {};
  const blocks = sections
    .filter((s) => Number.isInteger(s.pageNumber))
    .map((s) => ({
      pageNumber: s.pageNumber,
      documentEvidenceId: s.sourceSectionId,
      extractedText: String(s.text || s.excerpt || ''),
    }));
  const idx = buildProvisionPagesIndex(blocks, instrumentStart);
  return Object.fromEntries([...idx.entries()].map(([k, v]) => [k, [...v.pages].sort((a, b) => a - b)]));
}

function pagesForFinding(sourceSectionIds, sectionById, pageIndex) {
  const pages = new Set(
    sourceSectionIds.map((id) => sectionById.get(id)?.pageNumber).filter((p) => Number.isInteger(p)),
  );
  for (const id of sourceSectionIds) {
    const s = sectionById.get(id);
    const setOut = Array.isArray(s?.provisionsSetOut) ? s.provisionsSetOut : [];
    for (const core of setOut) {
      for (const p of pageIndex[core] || []) pages.add(p);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** Legacy broad finding types, now derived from the regulatory classification code. */
export const FINDING_CLASSIFICATIONS = [
  { id: 'binding_requirement', label: 'Binding requirement', createsObligation: true },
  { id: 'guidance_on_requirement', label: 'Guidance on a binding requirement', createsObligation: false },
  { id: 'non_binding_guidance', label: 'Non-binding guidance / expectation', createsObligation: false },
  { id: 'permission', label: 'Permission', createsObligation: false },
  { id: 'scope_exclusion', label: 'Scope exclusion', createsObligation: false },
  { id: 'definition', label: 'Definition / interpretation', createsObligation: false },
  { id: 'safe_harbour', label: 'Safe harbour / liability protection', createsObligation: false },
  { id: 'explanatory_statement', label: 'Explanatory statement', createsObligation: false },
];

export const OBLIGATION_CLASSIFICATIONS = new Set(
  FINDING_CLASSIFICATIONS.filter((c) => c.createsObligation).map((c) => c.id),
);

export const MIN_QUOTATION_LENGTH = 20;
export const MIN_UAT_JUSTIFICATION_LENGTH = 20;
export const MIN_OBLIGATION_STATEMENT_LENGTH = 10;

const STOPWORDS = new Set([
  'about', 'after', 'also', 'and', 'any', 'are', 'been', 'before', 'being', 'both', 'but', 'can', 'could',
  'each', 'for', 'from', 'has', 'have', 'into', 'its', 'may', 'not', 'only', 'other', 'shall', 'should',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'under', 'upon', 'were', 'when', 'where', 'which', 'while', 'will', 'with', 'within', 'would',
]);

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** Typography and whitespace only — wording must match the PDF exactly. */
export function normaliseQuotation(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00AD/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quotationOccursOnPage(quotation, pageText) {
  const q = normaliseQuotation(quotation);
  if (q.length < MIN_QUOTATION_LENGTH) return false;
  return normaliseQuotation(pageText).includes(q);
}

function substantiveTokens(text) {
  return [...tokens(text)].filter((t) => !STOPWORDS.has(t));
}

/**
 * @param {string} statement
 * @param {string[]} quotations normalized raw quotation strings
 */
export function obligationStatementGroundedInQuotations(statement, quotations) {
  const stmt = normaliseQuotation(statement);
  if (stmt.length < MIN_OBLIGATION_STATEMENT_LENGTH) return { ok: false, error: 'obligation_statement_required' };
  const union = normaliseQuotation(quotations.filter(Boolean).join(' '));
  if (union.length < MIN_QUOTATION_LENGTH) return { ok: false, error: 'finding_quotation_required' };
  const stmtTokens = substantiveTokens(stmt);
  if (!stmtTokens.length) return { ok: false, error: 'obligation_statement_unsupported' };
  const unionTokens = tokens(union);
  const unsupported = stmtTokens.filter((t) => !unionTokens.has(t));
  const ratio = unsupported.length / stmtTokens.length;
  if (ratio > 0.15) return { ok: false, error: 'obligation_statement_exceeds_evidence' };
  const dutyRe = /\b(must|shall|required|prohibited|ensure|take reasonable steps)\b/i;
  if (dutyRe.test(stmt) && !dutyRe.test(union)) return { ok: false, error: 'obligation_statement_duty_not_in_quotation' };
  return { ok: true };
}

/**
 * Verifies a quotation on one cited page or across two consecutive cited pages (RI-CLS-009).
 * @param {number[]} citedPages sorted
 */
export function quotationVerifiableOnPages(quotation, pageTextByNumber, citedPages) {
  const pages = [...new Set(citedPages.filter((p) => Number.isInteger(p)))].sort((a, b) => a - b);
  for (const p of pages) {
    if (quotationOccursOnPage(quotation, pageTextByNumber.get(p) || '')) return { ok: true, quotationPage: p };
  }
  for (let i = 0; i < pages.length - 1; i++) {
    const a = pages[i];
    const b = pages[i + 1];
    if (b !== a + 1) continue;
    const combined = normaliseQuotation(`${pageTextByNumber.get(a) || ''} ${pageTextByNumber.get(b) || ''}`);
    const q = normaliseQuotation(quotation);
    if (q.length >= MIN_QUOTATION_LENGTH && combined.includes(q)) return { ok: true, quotationPage: a, spansPages: [a, b] };
  }
  return { ok: false };
}

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Best candidate obligation for a finding by wording and shared source sections. A hint, not evidence. */
export function suggestCandidateForFinding(finding, candidates) {
  const claimTokens = tokens(finding.statement);
  const claimSections = new Set(finding.sourceSectionIds || []);
  let best = null;
  (candidates || []).forEach((cand, index) => {
    const textScore = jaccard(claimTokens, tokens(`${cand.statement || ''} ${cand.sourceQuotation || ''}`));
    const sections = cand.sourceSectionIds || [];
    const sectionScore = sections.length ? sections.filter((s) => claimSections.has(s)).length / sections.length : 0;
    const score = textScore * 0.8 + sectionScore * 0.2;
    if (!best || score > best.score) best = { index, score, cand };
  });
  if (!best || best.score < 0.2 || !best.cand.sourceQuotation) return null;
  return {
    candidateIndex: best.index,
    score: Math.round(best.score * 100) / 100,
    modelBindingNature: best.cand.bindingNature || null,
    sourceQuotation: best.cand.sourceQuotation,
    citation: best.cand.citation || null,
    applicabilityConditions: best.cand.applicabilityConditions || null,
  };
}

/**
 * @param {{ structured_output?: any }} run
 * @param {Array<{ id: string, claim_index: number, claim_text: string, citation_status: string, source_section_ids: string[] }>} citations
 * @param {{ policy?: any, publicationType?: string | null }} [classification]
 */
export function buildFindingsView(run, citations, classification) {
  const policy = classification?.policy ?? null;
  const publicationType = classification?.publicationType ?? null;
  const output = run.structured_output || {};
  const grounding = output._forgeniqGrounding || {};
  const catalog = Array.isArray(grounding.sectionCatalog) ? grounding.sectionCatalog : [];
  const claims = Array.isArray(output.claims) ? output.claims : [];
  const candidates = Array.isArray(output.candidates) ? output.candidates : [];
  const sectionById = new Map(catalog.map((s) => [s.sourceSectionId, s]));
  const provisionPageIndex = provisionPageIndexFromCatalog(catalog, grounding.provisionPageIndex);

  const findings = [...citations]
    .sort((a, b) => a.claim_index - b.claim_index)
    .map((c) => {
      const sourceSectionIds = c.source_section_ids || [];
      const pages = pagesForFinding(sourceSectionIds, sectionById, provisionPageIndex);
      const finding = {
        findingId: c.id,
        number: c.claim_index + 1,
        claimIndex: c.claim_index,
        statement: c.claim_text,
        claimTextSha256: sha256Hex(c.claim_text),
        modelConfidence: typeof claims[c.claim_index]?.confidence === 'number' ? claims[c.claim_index].confidence : null,
        citationStatus: c.citation_status,
        sourceSectionIds,
        pages,
        sections: sourceSectionIds
          .map((id) => sectionById.get(id))
          .filter(Boolean)
          .map((s) => ({
            sourceSectionId: s.sourceSectionId,
            pageNumber: s.pageNumber,
            citation: s.citation,
            excerpt: s.excerpt,
            inLegalInstrument: s.inLegalInstrument === true,
            transitionalProvisions: s.transitionalProvisions === true,
            provisionsSetOut: Array.isArray(s.provisionsSetOut) ? s.provisionsSetOut : [],
            provisionTextStatus:
              s.provisionTextStatus && typeof s.provisionTextStatus === 'object' && !Array.isArray(s.provisionTextStatus)
                ? s.provisionTextStatus
                : {},
          })),
      };
      finding.modelLabels = modelLabelsForFinding(finding, candidates);
      finding.regulatorySourceExcerpt = sourceSectionIds
        .map((id) => sectionById.get(id))
        .filter(Boolean)
        .map((s) => ({ pageNumber: s.pageNumber, excerpt: String(s.text || s.excerpt || '').slice(0, 1200) }));
      return {
        ...finding,
        suggestion: suggestCandidateForFinding(finding, candidates),
        triage: evaluateFindingTriage({ policy, publicationType, finding }),
        provisionPageIndex,
      };
    });

  return {
    findings,
    evidence: {
      kind: grounding.kind || null,
      extractionRevisionId: grounding.extractionRevisionId || null,
      selection: grounding.selection || null,
      obligationGradeSuitable: grounding.obligationGradeSuitable === true,
      pathway: grounding.obligationGradeSuitable === true ? 'production_grounded' : 'human_verified_uat',
    },
  };
}

/**
 * @returns {{ ok: true, decisions: any[] } | { ok: false, error: string }}
 */
const DISPOSITION_VALUES = new Set(Object.values(DISPOSITIONS));
const PROVISION_FUNCTION_VALUES = new Set(Object.values(PROVISION_FUNCTIONS));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalText = (v) => {
  const t = String(v ?? '').trim();
  return t || null;
};

/**
 * Every finding needs an explicit decision. Accepted findings carry a regulatory classification code from the
 * regulator policy and a disposition allowed in their triage queue; only CONVERT_TO_DRAFT_OBLIGATION in the
 * Obligation Triage queue creates a DRAFT obligation.
 *
 * @param {{ pathway: string, policy?: any, publicationType?: string | null }} context
 * @returns {{ ok: true, decisions: any[] } | { ok: false, error: string }}
 */
export function validateFindingDecisions(findings, decisions, context) {
  const { pathway } = context;
  const policy = context.policy ?? null;
  const publicationType = context.publicationType ?? null;
  if (!Array.isArray(decisions)) return { ok: false, error: 'finding_decisions_invalid' };
  const byId = new Map(findings.map((f) => [f.findingId, f]));
  const seen = new Set();
  const out = [];
  for (const d of decisions) {
    const finding = byId.get(d?.findingId);
    if (!finding || seen.has(d.findingId)) return { ok: false, error: 'finding_decisions_incomplete' };
    seen.add(d.findingId);
    const n = finding.number;
    if (d.decision !== 'ACCEPTED' && d.decision !== 'REJECTED') return { ok: false, error: `finding_decision_invalid:${n}` };
    if (d.claimTextSha256 !== finding.claimTextSha256) return { ok: false, error: `finding_text_mismatch:${n}` };
    const comment = String(d.comment ?? '').trim();
    if (!comment) return { ok: false, error: `finding_comment_required:${n}` };

    const code = optionalText(d.regulatoryClassificationCode);
    if (code && !CANONICAL_CLASSIFICATION_CODES[code]) return { ok: false, error: `finding_classification_unknown:${n}` };
    if (d.decision === 'ACCEPTED' && !code) return { ok: false, error: `finding_classification_code_required:${n}` };
    if (code && !policyEntry(policy, code)) return { ok: false, error: policy ? `finding_classification_unknown:${n}` : 'classification_policy_unavailable' };
    const provisionFunction = optionalText(d.provisionFunction);
    if (provisionFunction && !PROVISION_FUNCTION_VALUES.has(provisionFunction)) {
      return { ok: false, error: `finding_provision_function_invalid:${n}` };
    }
    const provisionReference = optionalText(d.provisionReference)?.replace(/\s+/g, ' ') ?? null;

    const quotation = normaliseQuotation(d.quotation);
    const supplementary = Array.isArray(d.supplementaryQuotations)
      ? d.supplementaryQuotations
          .map((q) => ({
            quotation: normaliseQuotation(q?.quotation),
            quotationPage: q?.quotationPage == null ? null : Number(q.quotationPage),
          }))
          .filter((q) => q.quotation.length >= MIN_QUOTATION_LENGTH && Number.isInteger(q.quotationPage))
      : [];
    const page = d.quotationPage == null || d.quotationPage === '' ? null : Number(d.quotationPage);
    const obligationStatement = optionalText(d.obligationStatement);
    const proposal = {
      code,
      legalBasis: optionalText(d.legalBasis),
      quotation,
      quotationPage: Number.isInteger(page) ? page : null,
      supportingObligationId: optionalText(d.supportingObligationId),
      supportingFindingId: optionalText(d.supportingFindingId),
      reclassificationEvidence: optionalText(d.reclassificationEvidence),
      provisionReference,
      provisionFunction,
    };
    const explicitDisposition = optionalText(d.disposition);
    let triage = evaluateFindingTriage({ policy, publicationType, finding, proposal: code ? proposal : null });
    if (
      d.decision === 'ACCEPTED' &&
      explicitDisposition === DISPOSITIONS.ORGANISATION_NOT_APPLICABLE &&
      code &&
      !QUEUE_ACTIONS[triage.queue]?.includes(explicitDisposition)
    ) {
      const provisional = evaluateFindingTriage({ policy, publicationType, finding, proposal: null });
      if (provisional.queue === TRIAGE_QUEUES.OBLIGATION) {
        triage = { ...provisional, provisional: false };
      } else if (policyEntry(policy, code)?.conversionEnabled) {
        triage = {
          queue: TRIAGE_QUEUES.OBLIGATION,
          exceptionReasons: [],
          conversionEligible: false,
          nonOperativeProvision: false,
          legalStatus: policyEntry(policy, code).legalStatus,
          provisional: false,
        };
      }
    }
    const entry = {
      findingId: d.findingId,
      claimTextSha256: d.claimTextSha256,
      decision: d.decision,
      comment,
      regulatoryClassificationCode: code,
      classification: code ? CANONICAL_CLASSIFICATION_CODES[code].findingClassification : null,
      triageQueue: triage.queue,
      exceptionReasons: triage.exceptionReasons,
      disposition: null,
      provisionReference,
      provisionFunction,
    };

    if (d.decision === 'ACCEPTED') {
      const disposition =
        optionalText(d.disposition) ??
        (policyEntry(policy, code)?.conversionEnabled && !triage.nonOperativeProvision ? DISPOSITIONS.CONVERT : DISPOSITIONS.SUPPORTING);
      if (!DISPOSITION_VALUES.has(disposition)) return { ok: false, error: `finding_disposition_invalid:${n}` };
      entry.disposition = disposition;

      if (disposition === DISPOSITIONS.CONVERT) {
        const refusal = conversionRefusal(triage, n);
        if (refusal) return { ok: false, error: refusal };
        const allowedPages = new Set(finding.pages);
        const core = parseProvisionReference(provisionReference || '')?.core;
        if (core && finding.provisionPageIndex?.[core]) {
          for (const p of finding.provisionPageIndex[core]) allowedPages.add(p);
        }
        for (const sq of supplementary) allowedPages.add(sq.quotationPage);
        if (!allowedPages.has(proposal.quotationPage)) return { ok: false, error: `finding_quotation_page_not_cited:${n}` };
        for (const sq of supplementary) {
          if (!allowedPages.has(sq.quotationPage)) return { ok: false, error: `finding_quotation_page_not_cited:${n}` };
        }
        const statement = obligationStatement || finding.statement;
        const grounded = obligationStatementGroundedInQuotations(statement, [
          proposal.quotation,
          ...supplementary.map((q) => q.quotation),
        ]);
        if (!grounded.ok) return { ok: false, error: `${grounded.error}:${n}` };
        if (pathway === 'human_verified_uat' && comment.length < MIN_UAT_JUSTIFICATION_LENGTH) {
          return { ok: false, error: `finding_justification_required:${n}` };
        }
        if (proposal.supportingObligationId && !UUID_RE.test(proposal.supportingObligationId)) {
          return { ok: false, error: `finding_binding_link_invalid:${n}` };
        }
        Object.assign(entry, {
          legalBasis: proposal.legalBasis,
          quotation: proposal.quotation,
          quotationPage: proposal.quotationPage,
          supplementaryQuotations: supplementary,
          obligationStatement: statement,
          legalStatus: triage.legalStatus,
          supportingObligationId: proposal.supportingObligationId,
          supportingFindingId: proposal.supportingFindingId,
          reclassificationEvidence: proposal.reclassificationEvidence,
          createsObligation: true,
        });
      } else {
        if (!QUEUE_ACTIONS[triage.queue].includes(disposition)) return { ok: false, error: `finding_disposition_not_allowed:${n}` };
        if (disposition === DISPOSITIONS.LINK) {
          const linked = optionalText(d.linkedObligationId);
          if (!linked || !UUID_RE.test(linked)) return { ok: false, error: `finding_linked_obligation_required:${n}` };
          entry.linkedObligationId = linked;
        }
      }
    }
    out.push(entry);
  }
  if (seen.size !== findings.length) return { ok: false, error: 'finding_decisions_incomplete' };

  const converted = new Map(out.filter((e) => e.createsObligation).map((e) => [e.findingId, e]));
  for (const e of converted.values()) {
    if (!e.supportingFindingId) continue;
    const target = converted.get(e.supportingFindingId);
    if (!target || target.legalStatus !== 'binding') {
      return { ok: false, error: `finding_binding_link_invalid:${byId.get(e.findingId).number}` };
    }
  }
  return { ok: true, decisions: out };
}
