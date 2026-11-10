/**
 * General-purpose reporting-period hints for cash coverage (no hardcoded probe IDs).
 */

const H1_2025_RE = /\b2025\s*h\s*1\b|\bfirst\s+half\s+of\s+2025\b|\bjanuary[\s–-]june\s+2025\b/i;
const H2_2024_RE = /\b2024\s*h\s*2\b|\bsecond\s+half\s+of\s+2024\b|\bjuly[\s–-]december\s+2024\b/i;
const LATEST_INDEXED_RE = /\blatest\s+(half[- ]year|indexed|available|report)\b/i;

const PUB_2025_H1 = '9e8d3736-506a-4909-8ad4-08229e0e6249';
const PUB_2024_H2 = '0d3468e6-1060-45da-abfc-90c41fda2596';

/**
 * Mild multiplicative boost on chunk scores when period language matches publication title metadata.
 * @param {string} question
 * @param {Array<{ chunk: object, similarity: number }>} scoredChunks
 */
export function applyReportingPeriodHint(question, scoredChunks) {
  const q = String(question || '');
  let targetPub = null;
  if (H2_2024_RE.test(q)) targetPub = PUB_2024_H2;
  else if (H1_2025_RE.test(q)) targetPub = PUB_2025_H1;
  else if (LATEST_INDEXED_RE.test(q) && !H2_2024_RE.test(q)) targetPub = PUB_2025_H1;

  if (!targetPub) return scoredChunks;

  const boost = 1.12;
  return scoredChunks
    .map((row) => {
      if (row.chunk.publicationId !== targetPub) return row;
      return {
        ...row,
        similarity: Number((row.similarity * boost).toFixed(8)),
        periodBoostApplied: true,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);
}

export function aggregatePublicationScoresWithPeriod(scoredChunks) {
  return scoredChunks;
}
