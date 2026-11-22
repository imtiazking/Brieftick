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
} from '../classification/regulatory-classification-policy.mjs';
import { PROVISION_FUNCTIONS } from '../classification/provision-eligibility.mjs';

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

  const findings = [...citations]
    .sort((a, b) => a.claim_index - b.claim_index)
    .map((c) => {
      const sourceSectionIds = c.source_section_ids || [];
      const pages = [
        ...new Set(sourceSectionIds.map((id) => sectionById.get(id)?.pageNumber).filter((p) => Number.isInteger(p))),
      ].sort((a, b) => a - b);
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
          })),
      };
      finding.modelLabels = modelLabelsForFinding(finding, candidates);
      return {
        ...finding,
        suggestion: suggestCandidateForFinding(finding, candidates),
        triage: evaluateFindingTriage({ policy, publicationType, finding }),
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
    const page = d.quotationPage == null || d.quotationPage === '' ? null : Number(d.quotationPage);
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
    const triage = evaluateFindingTriage({ policy, publicationType, finding, proposal: code ? proposal : null });
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
        if (!finding.pages.includes(proposal.quotationPage)) return { ok: false, error: `finding_quotation_page_not_cited:${n}` };
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
