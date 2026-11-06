import { CITATION_KIND, EVIDENCE_CONFIDENCE } from './enums.js';

/**
 * Deterministic evidenceConfidence (not model self-report).
 * HIGH: all material findings cite validated OFFICIAL_SOURCE in context.
 * MEDIUM: mix of official + RI_RECORD citations, all validated.
 * LOW: validated but sparse/ambiguous context (still structurally valid).
 */
export function scoreEvidenceConfidence({ findings = [], citations = [], contextRecordIds = [] }) {
  if (!findings.length) return EVIDENCE_CONFIDENCE.LOW;
  const official = citations.filter((c) => c.citationKind === CITATION_KIND.OFFICIAL_SOURCE);
  const ri = citations.filter((c) => c.citationKind === CITATION_KIND.RI_RECORD);
  const allOfficial =
    findings.length > 0 &&
    citations.length >= findings.length &&
    official.length === citations.length &&
    official.every((c) => contextRecordIds.includes(c.sourceRecordId || c.recordId));
  if (allOfficial) return EVIDENCE_CONFIDENCE.HIGH;
  const allInContext = citations.every((c) => {
    const id = c.sourceRecordId || c.recordId;
    return id && contextRecordIds.includes(id);
  });
  if (allInContext && official.length > 0) return EVIDENCE_CONFIDENCE.MEDIUM;
  if (allInContext) return EVIDENCE_CONFIDENCE.LOW;
  return EVIDENCE_CONFIDENCE.LOW;
}
