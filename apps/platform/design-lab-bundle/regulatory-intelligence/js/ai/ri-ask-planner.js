/**
 * Deterministic Ask RI query decomposition (no exact-question matching).
 */

export const EVIDENCE_DISPLAY_CAP = 12;

const SECONDARY_PATTERNS = [
  { id: 'linked-actions', re: /\b(actions?|compliance actions?|steps|remediation|firms should take|response actions?)\b/i },
  { id: 'linked-obligations', re: /\b(obligations?|open obligations?|remain open|which obligations)\b/i },
  { id: 'linked-assessments', re: /\b(impact assessments?|assessments?|ia\b)/i },
  { id: 'linked-risks', re: /\b(risks?)\b/i },
  { id: 'linked-controls', re: /\b(controls?)\b/i },
];

export function detectSecondaryIntents(question) {
  const lower = String(question || '').toLowerCase();
  const intents = [];
  for (const { id, re } of SECONDARY_PATTERNS) {
    if (re.test(lower)) intents.push(id);
  }
  return [...new Set(intents)];
}

export function decomposeAskQuery(parsed, question) {
  const secondaryIntents = detectSecondaryIntents(question);
  const compound = secondaryIntents.length > 0 && Boolean(parsed.filters?.intent);
  return {
    primaryIntent: parsed.filters?.intent || null,
    secondaryIntents,
    compound,
    sectorId: parsed.filters?.sectorId,
    sectorSlug: parsed.filters?.sectorSlug,
  };
}
