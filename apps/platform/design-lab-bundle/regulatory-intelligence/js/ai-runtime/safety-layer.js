/** Deterministic prompt-injection heuristics — not a complete defence. */
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /send\s+data\s+to/i,
  /reveal\s+secret/i,
  /\bexecute\b.*\bcommand/i,
  /approve\s+this\s+publication/i,
  /you\s+are\s+now\s+/i,
];

export function scanSourceForInjection(text) {
  const warnings = [];
  const content = String(text || '');
  for (const re of SUSPICIOUS_PATTERNS) {
    if (re.test(content)) warnings.push({ pattern: re.source, severity: 'Potential Prompt Injection' });
  }
  return {
    safetyStatus: warnings.length ? 'Warning' : 'Pass',
    promptInjectionWarnings: warnings,
    untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
  };
}

export function buildDelimitedContext({ systemInstructions, organisationContext, sourceBlocks }) {
  return {
    system: systemInstructions,
    organisation: organisationContext,
    sources: sourceBlocks.map((b) => ({
      ...b,
      delimiter: 'UNTRUSTED_REGULATORY_SOURCE_CONTENT',
    })),
  };
}
