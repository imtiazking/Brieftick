/**
 * Ask RI fixture answer must match deterministic retrieval (counts / primary target).
 */
import {
  summarizeObligationPortfolio,
  UI_LABEL_ACTIVE_IN_REVIEW_OBLIGATIONS,
} from './obligation-portfolio.js';

const PRIMARY_RECORD_RE = /\b(\d+)\s+primary\s+(Change|Obligation|Action|Control)\s+record/i;
const LINKED_RECORD_RE = /\b(\d+)\s+linked\s+(Change|Obligation|Action|Control)s?\b/i;
const ACTIVE_IN_REVIEW_RE = /Active \+ in-review Obligations retrieved:\s*(\d+)/i;

export function obligationsInRetrieval(state, retrieval) {
  const ids = (retrieval?.matchedRecordIdsAll || retrieval?.matchedRecordIds || []).filter(
    (id) => retrieval?.recordTypes?.[id] === 'Obligation'
  );
  return ids.map((id) => state?.obligations?.find((o) => o.id === id)).filter(Boolean);
}

export function obligationTaxonomyFromRetrieval(state, retrieval) {
  const obls = obligationsInRetrieval(state, retrieval);
  const portfolio = summarizeObligationPortfolio(obls);
  return {
    total: obls.length,
    activeInReview: portfolio.counts.ACTIVE + portfolio.counts.REVIEW,
    draft: portfolio.counts.DRAFT,
    review: portfolio.counts.REVIEW,
    active: portfolio.counts.ACTIVE,
    portfolio,
  };
}

export function formatObligationCountKeyFinding(state, retrieval) {
  const tax = obligationTaxonomyFromRetrieval(state, retrieval);
  if (tax.total === 0) return 'No Obligation records in the retrieval boundary.';
  const parts = [];
  if (tax.activeInReview > 0) {
    parts.push(`${UI_LABEL_ACTIVE_IN_REVIEW_OBLIGATIONS}: ${tax.activeInReview}`);
  }
  if (tax.draft > 0) parts.push(`Draft obligations: ${tax.draft}`);
  if (tax.portfolio.counts.CLOSED > 0) parts.push(`Closed obligations: ${tax.portfolio.counts.CLOSED}`);
  if (tax.portfolio.counts.UNCLASSIFIED > 0) {
    parts.push(`Unclassified obligations: ${tax.portfolio.counts.UNCLASSIFIED}`);
  }
  return parts.join('; ');
}

export function buildCompoundAskAnswerParts(ctx) {
  const retrieval = ctx?.retrieval || {};
  const state = ctx?.state;
  const ec = retrieval.evaluatedCounts || {};
  const primaryType = retrieval.requestedTargetType || retrieval.plan?.primaryTargetType || 'Change';
  const gaps = retrieval.secondaryGaps || [];

  const primaryInfo = ec[primaryType];
  const primaryCount = primaryInfo?.evaluated ? primaryInfo.count : retrieval.primaryResultCount ?? 0;

  const countParts = [`${primaryCount} primary ${primaryType} record(s)`];
  const keyFindings = [`Primary ${primaryType}s retrieved: ${primaryCount}`];

  for (const type of ['Change', 'Obligation', 'Action', 'Control', 'Risk', 'ImpactAssessment']) {
    if (type === primaryType) continue;
    const info = ec[type];
    if (!info?.evaluated) continue;
    if (info.count > 0) {
      countParts.push(`${info.count} linked ${type}(s)`);
      keyFindings.push(`Linked ${type}s retrieved: ${info.count}`);
    } else if (type === 'Obligation' && gaps.includes('linked-open-obligations')) {
      keyFindings.push('No active + in-review obligations were found in RI.');
    } else if (info.count === 0 && gaps.includes(`linked-${type.toLowerCase()}s`)) {
      keyFindings.push(`No linked ${type} records are recorded for these Changes in RI.`);
    }
  }

  if (ec.Obligation?.evaluated && state) {
    const oblLine = formatObligationCountKeyFinding(state, retrieval);
    if (oblLine && !oblLine.startsWith('No Obligation')) keyFindings.push(oblLine);
  }

  const actionStatuses = ctx?.deterministicFacts?.linkedActionStatuses || [];
  const statusLine =
    actionStatuses.length > 0
      ? `Action statuses from RI: ${actionStatuses.map((a) => `${a.actionId}=${a.status}`).join(', ')}.`
      : '';

  const openOblGap = gaps.includes('linked-open-obligations');
  let answer = `AI SYNTHESIS: RI contains ${countParts.join('; ')} for the resolved graph anchor.`;
  if (statusLine) answer += ` ${statusLine}`;
  if (openOblGap) answer += ' No active + in-review obligations were found in RI.';

  return { answer: answer.trim(), keyFindings: keyFindings.filter(Boolean), primaryType, primaryCount };
}

export function validateAskRiAnswerAgainstRetrieval(retrieval, structured) {
  const errors = [];
  if (!retrieval) return { ok: true, errors };

  const primaryType = retrieval.requestedTargetType || retrieval.plan?.primaryTargetType || 'Change';
  const ec = retrieval.evaluatedCounts || {};
  const answer = String(structured?.answer || '');
  const findings = (structured?.keyFindings || []).join(' ');
  const text = `${answer} ${findings}`;

  const primaryMatch = text.match(PRIMARY_RECORD_RE);
  if (primaryMatch) {
    const claimedType = primaryMatch[2];
    const claimed = Number(primaryMatch[1]);
    if (claimedType !== primaryType) {
      errors.push(`answer claims primary ${claimedType} but retrieval primary is ${primaryType}`);
    } else {
      const expected = ec[primaryType]?.evaluated ? ec[primaryType].count : retrieval.primaryResultCount ?? 0;
      if (claimed !== expected) {
        errors.push(`primary ${primaryType} count ${claimed} != retrieval ${expected}`);
      }
    }
  }

  for (const linkedMatch of text.matchAll(new RegExp(LINKED_RECORD_RE.source, 'gi'))) {
    const claimed = Number(linkedMatch[1]);
    const type = linkedMatch[2];
    if (!ec[type]?.evaluated) {
      errors.push(`answer claims linked ${type} but retrieval did not evaluate ${type}`);
      continue;
    }
    if (claimed !== ec[type].count) {
      errors.push(`linked ${type} count ${claimed} != retrieval ${ec[type].count}`);
    }
  }

  const airMatch = text.match(ACTIVE_IN_REVIEW_RE);
  if (airMatch && retrieval.state) {
    const tax = obligationTaxonomyFromRetrieval(retrieval.state, retrieval);
    const claimed = Number(airMatch[1]);
    if (claimed !== tax.activeInReview) {
      errors.push(`active+in-review count ${claimed} != portfolio ${tax.activeInReview}`);
    }
  }

  const evidenceCounts = {};
  for (const id of retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []) {
    const t = retrieval.recordTypes?.[id];
    if (!t) continue;
    evidenceCounts[t] = (evidenceCounts[t] || 0) + 1;
  }
  for (const type of ['Change', 'Obligation', 'Action', 'Control']) {
    const re = new RegExp(`\\b(\\d+)\\s+${type}\\s+record`, 'i');
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (evidenceCounts[type] != null && n > evidenceCounts[type] && !text.includes('primary')) {
      errors.push(`${type} count ${n} exceeds evidence set ${evidenceCounts[type]}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
