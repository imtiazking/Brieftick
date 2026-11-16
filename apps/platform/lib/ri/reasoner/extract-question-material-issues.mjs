/**
 * Production material issues derived from user question only (no eval suite metadata).
 */

const ISSUE_PATTERNS = [
  { id: 'binding_obligation', kind: 'binding_vs_guidance', pattern: /\b(must|shall|required|obligation|binding)\b/i },
  { id: 'guidance_status', kind: 'binding_vs_guidance', pattern: /\b(guidance|should|expect|good practice)\b/i },
  { id: 'applicability_scope', kind: 'applicability', pattern: /\b(apply|applicable|scope|firm|credit union|in scope)\b/i },
  { id: 'effective_date', kind: 'temporal', pattern: /\b(when|effective|commence|come into force|deadline|date)\b/i },
  { id: 'jurisdiction', kind: 'jurisdiction', pattern: /\b(jurisdiction|UK|FCA|PRA|CBUAE|handbook|CONC|COBS|PRIN)\b/i },
  { id: 'evidence_sufficiency', kind: 'evidence', pattern: /\b(evidence|retain|document|demonstrate)\b/i },
  { id: 'multi_source', kind: 'multi_document', pattern: /\b(and|between|compare|conflict|both)\b/i },
];

export function extractMaterialIssuesFromQuestion(question) {
  const text = String(question || '').trim();
  const issues = [{ id: 'primary_question', kind: 'question_core', label: text.slice(0, 240) }];
  const qLower = text.toLowerCase();
  for (const row of ISSUE_PATTERNS) {
    if (row.pattern.test(text) || (row.id === 'jurisdiction' && /\bCONC\b|\bCOBS\b|\bPRIN\b/i.test(text))) {
      issues.push({ id: row.id, kind: row.kind, label: row.id.replace(/_/g, ' ') });
    }
  }
  if (/\bPS\d+|policy statement\b/i.test(text)) {
    issues.push({ id: 'named_publication', kind: 'source_identification', label: 'Named publication reference in question' });
  }
  return issues;
}

export function questionReferencesAbsentFromRetrieval(question, retrieval) {
  const refVal = retrieval?.referenceValidation;
  if (refVal?.blockSemanticSelection) return { absent: true, reason: 'reference_validation_blocked', detail: refVal };
  if (retrieval?.noMatchDecision?.abstain) return { absent: true, reason: 'no_match_abstain', detail: retrieval.noMatchDecision };
  const ranked = retrieval?.allRankedChunks || [];
  if (!ranked.length) return { absent: true, reason: 'no_ranked_chunks' };
  return { absent: false };
}