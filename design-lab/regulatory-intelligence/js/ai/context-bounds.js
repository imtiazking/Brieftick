export const CONTEXT_LIMITS = {
  maxRecordCount: 24,
  maxPerRecordSourceChars: 4000,
  maxTotalContextChars: 48000,
};

export function truncateText(text, max) {
  if (!text || text.length <= max) return text || '';
  return `${text.slice(0, max - 1)}…`;
}

export function applyContextBounds(records, limits = CONTEXT_LIMITS) {
  const ordered = [...records].sort((a, b) => a.recordId.localeCompare(b.recordId));
  const included = [];
  let total = 0;
  for (const rec of ordered) {
    if (included.length >= limits.maxRecordCount) break;
    const content = truncateText(rec.sourceContent || rec.excerpt || '', limits.maxPerRecordSourceChars);
    const nextLen = total + content.length;
    if (nextLen > limits.maxTotalContextChars) break;
    included.push({ ...rec, sourceContent: content });
    total = nextLen;
  }
  return {
    records: included,
    truncated: included.length < ordered.length,
    totalChars: total,
  };
}
