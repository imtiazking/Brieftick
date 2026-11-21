/**
 * UC-RI-005 per-finding review: finding view, suggested evidence and payload validation.
 * Mirrors the checks in public.ri_submit_ai_finding_review, which remains authoritative.
 */
import { createHash } from 'node:crypto';

export const FINDING_CLASSIFICATIONS = [
  { id: 'binding_requirement', label: 'Binding requirement', createsObligation: true },
  { id: 'guidance_on_requirement', label: 'Guidance on a binding requirement', createsObligation: true },
  { id: 'non_binding_guidance', label: 'Non-binding guidance / expectation', createsObligation: false },
  { id: 'permission', label: 'Permission', createsObligation: false },
  { id: 'scope_exclusion', label: 'Scope exclusion', createsObligation: false },
  { id: 'definition', label: 'Definition / interpretation', createsObligation: false },
  { id: 'safe_harbour', label: 'Safe harbour / liability protection', createsObligation: false },
  { id: 'explanatory_statement', label: 'Explanatory statement', createsObligation: false },
];

const CLASSIFICATION_IDS = new Set(FINDING_CLASSIFICATIONS.map((c) => c.id));
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
 */
export function buildFindingsView(run, citations) {
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
          .map((s) => ({ sourceSectionId: s.sourceSectionId, pageNumber: s.pageNumber, citation: s.citation, excerpt: s.excerpt })),
      };
      return { ...finding, suggestion: suggestCandidateForFinding(finding, candidates) };
    });

  return {
    findings,
    evidence: {
      kind: grounding.kind || null,
      extractionRevisionId: grounding.extractionRevisionId || null,
      obligationGradeSuitable: grounding.obligationGradeSuitable === true,
      pathway: grounding.obligationGradeSuitable === true ? 'production_grounded' : 'human_verified_uat',
    },
  };
}

/**
 * @returns {{ ok: true, decisions: any[] } | { ok: false, error: string }}
 */
export function validateFindingDecisions(findings, decisions, { pathway }) {
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
    const classification = d.classification ? String(d.classification) : null;
    const entry = { findingId: d.findingId, claimTextSha256: d.claimTextSha256, decision: d.decision, comment, classification };
    if (d.decision === 'ACCEPTED') {
      if (!classification || !CLASSIFICATION_IDS.has(classification)) {
        return { ok: false, error: `finding_classification_required:${n}` };
      }
      if (OBLIGATION_CLASSIFICATIONS.has(classification)) {
        if (finding.citationStatus !== 'VERIFIED') return { ok: false, error: `finding_citation_unverified:${n}` };
        const legalBasis = String(d.legalBasis ?? '').trim();
        if (legalBasis.length < 3) return { ok: false, error: `finding_legal_basis_required:${n}` };
        const quotation = normaliseQuotation(d.quotation);
        if (quotation.length < MIN_QUOTATION_LENGTH) return { ok: false, error: `finding_quotation_required:${n}` };
        const page = Number(d.quotationPage);
        if (!Number.isInteger(page)) return { ok: false, error: `finding_quotation_page_required:${n}` };
        if (!finding.pages.includes(page)) return { ok: false, error: `finding_quotation_page_not_cited:${n}` };
        if (pathway === 'human_verified_uat' && comment.length < MIN_UAT_JUSTIFICATION_LENGTH) {
          return { ok: false, error: `finding_justification_required:${n}` };
        }
        Object.assign(entry, { legalBasis, quotation, quotationPage: page, createsObligation: true });
      }
    }
    out.push(entry);
  }
  if (seen.size !== findings.length) return { ok: false, error: 'finding_decisions_incomplete' };
  return { ok: true, decisions: out };
}
