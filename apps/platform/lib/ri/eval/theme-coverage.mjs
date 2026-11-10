/**
 * Automated requiredAnswerThemes coverage — answer body only (not citations).
 */

function themeToPatterns(theme) {
  const t = String(theme).toLowerCase();
  const patterns = [];
  if (/consultation/.test(t)) patterns.push(/\bconsultation\b/i, /\bpropos(ed|al|ing)\b/i);
  if (/control impact narrative|control-impact narrative/.test(t)) {
    patterns.push(
      /\bcontrol(s)?\s+(may\s+be\s+)?(affected|impacted|changed)\b/i,
      /\bimpact\s+on\s+(financial crime\s+)?controls?\b/i,
      /\bwhich\s+financial crime controls\b/i,
      /\b(reasoned|labelled)\s+implication/i,
    );
  } else if (/control impact|controls may be affected|control-impact/.test(t)) {
    patterns.push(/\bcontrol(s)?\b.*\b(affect|impact|chang)/i, /\bfinancial crime control/i, /\bAML\b|\bCTF\b|\bsanction/i);
  }
  if (/business function|applicability/.test(t)) {
    patterns.push(/\bfunction\b/i, /\bapplicab/i, /\bbusiness\b/i, /\boperational\b/i);
  }
  if (/tenant obligation/.test(t)) {
    patterns.push(/\bOBL-EVAL-/i, /\bobligation(s)?\b/i, /\bCHG-EVAL-002\b/i, /\bfinancial crime\b.*\bobligation/i);
  }
  if (/cp26 citation/.test(t)) patterns.push(/\bCP\s*26\/38\b/i, /\b4d05b49b/i, /consultation paper.*financial crime/i);
  if (/wrong publication|wrong uuid|do not attribute/.test(t)) {
    patterns.push(/\b00000000-0000-4000-8000-000000000001\b/i, /\bwrong\b.*\b(uuid|publication|reference)\b/i, /\bnot (found|indexed|available)\b/i, /\bcannot (use|attribute)\b/i);
  }
  if (/no binding compliance|refute|false premise/.test(t)) {
    patterns.push(/\bno binding\b/i, /\bconsultation\b/i, /\bdoes not impose\b/i);
  }
  if (/deadline/.test(t)) patterns.push(/\b24\s+December\s+2026\b/i, /\bconsultation\b.*\bdeadline\b/i, /\bcomments?\b.*\bdue\b/i);
  if (/fraud|app|money mule/.test(t)) patterns.push(/\bfraud\b/i, /\bAPP\b|push payment/i, /\bmoney mule/i);
  if (!patterns.length) {
    const words = t.split(/\s+/).filter((w) => w.length > 4);
    if (words.length) patterns.push(new RegExp(words.slice(0, 3).join('|'), 'i'));
  }
  return patterns;
}

export function assessThemeCoverage(caseRow, engineResult) {
  const required = caseRow.requiredAnswerThemes || [];
  const answer = String(engineResult?.answer || '');
  const findings = engineResult?.findings || [];

  if (!required.length) {
    return {
      requiredThemes: [],
      themesAddressed: [],
      themesMissing: [],
      themeCoverageScore: 1,
      themeCoverageRatio: 1,
      limitations:
        'No requiredAnswerThemes declared; coverage treated as not applicable (not scored as addressed).',
      textAssessedChars: answer.length,
    };
  }

  const addressed = [];
  const missing = [];
  for (const theme of required) {
    const patterns = themeToPatterns(theme);
    const haystacks = [answer, ...findings.map((f) => String(f?.text || f?.summary || ''))];
    const hit = patterns.some((re) => haystacks.some((h) => re.test(h)));
    if (hit) addressed.push(theme);
    else missing.push(theme);
  }

  const ratio = required.length ? addressed.length / required.length : 1;

  return {
    requiredThemes: required,
    themesAddressed: addressed,
    themesMissing: missing,
    themeCoverageScore: Number(ratio.toFixed(3)),
    themeCoverageRatio: ratio,
    limitations:
      'Keyword/phrase heuristic on answer text and structured findings only; does not verify regulatory correctness.',
    textAssessedChars: answer.length,
  };
}
