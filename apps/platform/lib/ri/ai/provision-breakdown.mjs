/**
 * Deterministic provision-level breakdown of a rule (R) set out in a legal instrument.
 *
 * Splits a provision into limbs, classifies each limb's legal function (applicability condition, mandatory
 * notification, mandatory information, together/format requirement, definition or scope qualification) and states
 * which limbs may stand alone as obligations. Exact text is preserved verbatim from the source page text.
 * Pure text analysis: no AI, no inference beyond the structural cues named below.
 */

export const PROVISION_BREAKDOWN_VERSION = 'provision-breakdown-v1';

export const LIMB_KINDS = Object.freeze({
  APPLICABILITY_CONDITION: 'applicability_condition',
  OPERATIVE_LEAD_IN: 'operative_lead_in',
  MANDATORY_NOTIFICATION: 'mandatory_notification',
  MANDATORY_INFORMATION: 'mandatory_information',
  TOGETHER_REQUIREMENT: 'information_together_requirement',
  CONTENT_ELEMENT: 'content_element',
  DEFINITION_OR_SCOPE: 'definition_or_scope_qualification',
  UNCLASSIFIED: 'unclassified',
});

/** Terms whose legal meaning needs independent regulatory expert judgement. Detection is lexical only. */
export const EXPERT_JUDGEMENT_TERMS = Object.freeze([
  { re: /\bas soon as possible\b/i, id: 'timing_as_soon_as_possible', question: 'What period satisfies "as soon as possible"? The rule fixes no number of days; the FCA expectation on timing needs expert confirmation.' },
  { re: /\bsufficient information\b/i, id: 'sufficiency_standard', question: 'What level of detail is "sufficient information for the borrower to understand"? This is an outcome standard, not a content list.' },
  { re: /\bwhere relevant\b/i, id: 'conditional_relevance', question: 'When is a mitigation step "relevant"? The firm must decide per case; expert view on defensible criteria is needed.' },
  { re: /\bthe firm considers (?:are )?likely\b/i, id: 'firm_judgement', question: 'The firm is asked to judge likely consequences. What evidence of that judgement is expected?' },
  { re: /\breasonable notice\b/i, id: 'reasonable_notice', question: 'What length of notice is reasonable? The rule gives no period.' },
  { re: /\badverse consequences\b/i, id: 'adverse_consequences_scope', question: 'Which consequences count as adverse (charges, credit reporting, enforcement, loss of facility)? The rule does not enumerate them.' },
]);

function squash(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

const ROMAN = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);

/**
 * Extract the verbatim text of a provision (e.g. core "7.20.1R") across page texts, up to the next provision marker.
 * @param {Array<{ pageNumber: number, text: string }>} pages
 * @param {string} core like "7.20.1R"
 * @returns {{ text: string, pages: number[] } | null}
 */
export function extractProvisionText(pages, core) {
  const m = /^(\d+[A-Z]?(?:\.\d+[A-Z]?)*)([RGE])$/.exec(String(core || '').replace(/\s+/g, ''));
  if (!m) return null;
  const num = m[1].replace(/\./g, '\\.');
  const marker = m[2];
  const startRe = new RegExp(`(?<![\\d.])${num}\\s*${marker}\\s+(?=\\(\\d)`);
  const sorted = [...(pages || [])].sort((a, b) => a.pageNumber - b.pageNumber);
  let collected = '';
  const used = [];
  let started = false;
  for (const p of sorted) {
    let text = squash(p.text).replace(/FCA \d{4}\/\d+ FOS \d{4}\/\d+\s+Page \d+ of \d+\s*/g, '');
    if (!started) {
      const s = startRe.exec(text);
      if (!s) continue;
      text = text.slice(s.index);
      started = true;
    }
    // Next provision marker ends the provision: "7.20.2 G", "7.20.3 R" or a new heading-level number.
    const next = /(?<![\d.(])\d+[A-Z]?\.\d+[A-Z]?(?:\.\d+[A-Z]?)*\s+[RGE]\s+(?=\(?[A-Z\d])/g;
    next.lastIndex = started && !collected ? 1 : 0;
    let cut = -1;
    let nm;
    while ((nm = next.exec(text))) {
      if (nm.index === 0 && !collected) continue;
      cut = nm.index;
      break;
    }
    if (cut >= 0) {
      collected += `${collected ? ' ' : ''}${text.slice(0, cut)}`;
      used.push(p.pageNumber);
      return { text: squash(collected), pages: used };
    }
    collected += `${collected ? ' ' : ''}${text}`;
    used.push(p.pageNumber);
  }
  return started ? { text: squash(collected), pages: used } : null;
}

/**
 * Split provision text into a limb tree. Level 1 "(1)", level 2 "(a)", level 3 "(i)".
 * @param {string} provisionText text beginning at the first limb "(1)"
 */
export function splitLimbs(provisionText) {
  const text = squash(provisionText).replace(/^\d+[A-Z]?(?:\.\d+[A-Z]?)*\s*[RGE]\s+/, '');
  const markerRe = /\(([0-9]{1,2}|[a-z]{1,4})\)/g;
  const found = [];
  let m;
  let lastLevel2 = null;
  let lastLevel1 = 0;
  while ((m = markerRe.exec(text))) {
    const label = m[1];
    // A limb marker follows a sentence end or the start; a mid-sentence "(i)" cross-reference is skipped.
    const before = text.slice(Math.max(0, m.index - 3), m.index);
    const atStart = m.index === 0 || /[.:;]\s*$|and\s*$|or\s*$|\)\s*$/.test(before) || /\s$/.test(before);
    if (!atStart) continue;
    let level;
    if (/^\d+$/.test(label)) {
      const n = Number(label);
      if (n !== lastLevel1 + 1) continue;
      level = 1;
      lastLevel1 = n;
      lastLevel2 = null;
    } else if (ROMAN.has(label) && !(label === 'i' && lastLevel2 === 'h') && !(label === 'v' && lastLevel2 === 'u')) {
      level = 3;
    } else if (label.length === 1) {
      level = 2;
      lastLevel2 = label;
    } else continue;
    if (level > 1 && lastLevel1 === 0) continue;
    found.push({ level, label, index: m.index, endOfMarker: m.index + m[0].length });
  }
  const limbs = [];
  const path = [];
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].index : text.length;
    const own = squash(text.slice(f.endOfMarker, end));
    path.length = f.level - 1;
    path[f.level - 1] = f.label;
    limbs.push({ level: f.level, label: f.label, pathLabels: [...path], text: own });
  });
  return limbs;
}

function limbKind(limb, children) {
  const t = limb.text;
  if (limb.level === 1 && /^this rule applies\b|^this section applies\b|\bapplies where\b|^this rule applies to\b/i.test(t)) {
    return LIMB_KINDS.APPLICABILITY_CONDITION;
  }
  if (limb.level === 1 && /^in this (rule|section|chapter)\b|^references? to\b/i.test(t)) return LIMB_KINDS.DEFINITION_OR_SCOPE;
  if (/\bmust be provided together\b|\bprovided together\b/i.test(t) && /\b(under|required)\b/i.test(t)) return LIMB_KINDS.TOGETHER_REQUIREMENT;
  if (children.length && /\bthe firm must\b|\bmust:\s*$|\bmust\s*$/i.test(t)) return LIMB_KINDS.OPERATIVE_LEAD_IN;
  if (limb.level === 2 && /^notify\b/i.test(t)) return LIMB_KINDS.MANDATORY_NOTIFICATION;
  if (limb.level === 2 && /^provide\b[\s\S]*\binformation\b/i.test(t)) return LIMB_KINDS.MANDATORY_INFORMATION;
  if (limb.level >= 3) return LIMB_KINDS.CONTENT_ELEMENT;
  return LIMB_KINDS.UNCLASSIFIED;
}

function judgementFlags(text) {
  return EXPERT_JUDGEMENT_TERMS.filter((t) => t.re.test(text)).map((t) => ({ id: t.id, question: t.question }));
}

/**
 * @param {string} core e.g. "7.20.1R"
 * @param {string} provisionText verbatim provision text
 * @param {{ sourcebook?: string, pages?: number[] }} [ctx]
 */
export function breakDownProvision(core, provisionText, ctx = {}) {
  const sourcebook = ctx.sourcebook ?? 'CONC';
  const limbs = splitLimbs(provisionText);
  const isRule = /R$/.test(core);
  if (!limbs.length) {
    return {
      version: PROVISION_BREAKDOWN_VERSION,
      core,
      reference: `${sourcebook} ${core}`,
      parsed: false,
      reason: 'no_limb_structure_detected',
      limbs: [],
      standaloneObligationPaths: [],
      expertJudgement: judgementFlags(provisionText),
      verbatim: squash(provisionText),
    };
  }
  const withChildren = limbs.map((limb, i) => {
    const children = [];
    for (let j = i + 1; j < limbs.length && limbs[j].level > limb.level; j += 1) children.push(limbs[j]);
    return { limb, children };
  });
  const out = [];
  for (const { limb, children } of withChildren) {
    const kind = limbKind(limb, children);
    const pathText = limb.pathLabels.map((l) => `(${l})`).join('');
    const reference = `${sourcebook} ${core}${pathText}`;
    const mandatoryKinds = new Set([LIMB_KINDS.MANDATORY_NOTIFICATION, LIMB_KINDS.MANDATORY_INFORMATION, LIMB_KINDS.TOGETHER_REQUIREMENT]);
    // The lead-in carries the timing and "must" but its duty content sits in the children; it is not a separate obligation.
    const standaloneObligation = isRule && mandatoryKinds.has(kind);
    const conditions = [];
    if (/\(where relevant\)/i.test(limb.text) || /\bwhere relevant\b/i.test(limb.text)) conditions.push('where relevant');
    out.push({
      reference,
      level: limb.level,
      label: limb.label,
      kind,
      legalEffect:
        kind === LIMB_KINDS.APPLICABILITY_CONDITION
          ? 'condition_precedent_to_the_rule'
          : kind === LIMB_KINDS.DEFINITION_OR_SCOPE
            ? 'interpretation_or_scope'
            : kind === LIMB_KINDS.OPERATIVE_LEAD_IN
              ? 'imposes_duty_and_timing_on_child_limbs'
              : kind === LIMB_KINDS.CONTENT_ELEMENT
                ? 'required_content_of_parent_limb'
                : isRule && mandatoryKinds.has(kind)
                  ? 'binding_requirement'
                  : 'unclassified',
      standaloneObligation,
      text: limb.text,
      parentReference: limb.pathLabels.length > 1 ? `${sourcebook} ${core}${limb.pathLabels.slice(0, -1).map((l) => `(${l})`).join('')}` : null,
      conditions,
      expertJudgement: judgementFlags(limb.text),
    });
  }
  // Timing and duty-holder from the operative lead-in apply to the mandatory child limbs.
  const lead = out.find((l) => l.kind === LIMB_KINDS.OPERATIVE_LEAD_IN);
  const timing = lead && /\bas soon as possible\b/i.test(lead.text) ? squash(/(as soon as possible[^:]*?)(?=\s+the firm must|:)/i.exec(lead.text)?.[1] ?? 'as soon as possible') : null;
  for (const l of out) {
    if (lead && l.reference.startsWith(lead.reference) && l.reference !== lead.reference && l.standaloneObligation) {
      l.inheritedFromLeadIn = { reference: lead.reference, timing, dutyHolder: /the firm must/i.test(lead.text) ? 'the firm' : null, leadInText: lead.text };
    }
  }
  const expertJudgement = [];
  const seen = new Set();
  for (const l of out) {
    for (const f of l.expertJudgement) {
      const k = `${f.id}|${l.reference}`;
      if (!seen.has(k)) {
        seen.add(k);
        expertJudgement.push({ ...f, reference: l.reference });
      }
    }
  }
  return {
    version: PROVISION_BREAKDOWN_VERSION,
    core,
    reference: `${sourcebook} ${core}`,
    parsed: true,
    pages: ctx.pages ?? null,
    limbs: out,
    standaloneObligationPaths: out.filter((l) => l.standaloneObligation).map((l) => l.reference),
    applicabilityPaths: out.filter((l) => l.kind === LIMB_KINDS.APPLICABILITY_CONDITION).map((l) => l.reference),
    definitionPaths: out.filter((l) => l.kind === LIMB_KINDS.DEFINITION_OR_SCOPE).map((l) => l.reference),
    expertJudgement,
    verbatim: squash(provisionText),
  };
}

export function normaliseForMatch(text) {
  return squash(text).toLowerCase().replace(/[‘’']/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9()"' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Which limbs does a candidate quotation cover? A quotation covers a limb when a leading run of the limb's words
 * (up to 60 characters, normalised) occurs in the quotation.
 * @param {ReturnType<typeof breakDownProvision>} breakdown
 * @param {string} quotation
 */
export function quotationLimbCoverage(breakdown, quotation) {
  if (!breakdown?.parsed) return { parsed: false, coveredReferences: [], operativeCovered: null, onlyConditionOrDefinition: false };
  const q = normaliseForMatch(quotation);
  const covered = breakdown.limbs.filter((l) => {
    const probe = normaliseForMatch(l.text).slice(0, 60);
    return probe.length >= 12 && q.includes(probe);
  });
  const operativeCovered = covered.some((l) => l.standaloneObligation);
  const onlyConditionOrDefinition =
    covered.length > 0 &&
    covered.every((l) => l.kind === LIMB_KINDS.APPLICABILITY_CONDITION || l.kind === LIMB_KINDS.DEFINITION_OR_SCOPE);
  return {
    parsed: true,
    coveredReferences: covered.map((l) => l.reference),
    operativeCovered,
    onlyConditionOrDefinition,
  };
}
