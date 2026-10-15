import { esc } from './components.js';
import { AI_FRESHNESS, AI_REVIEW_STATUS } from './ai/enums.js';
import { canAskRi, canApproveExecutiveSummary, isAuditorReadOnly } from './ai/persona-ai.js';
import { formatActionOverdueCustomerCopy } from './ai/ask-ri-provenance.js';
import { SUPPORTED_QUESTION_EXAMPLES } from './ai/ri-interpreted-as.js';

function formatEvidenceConfidence(analysis) {
  const v = analysis?.evidenceConfidence;
  if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v;
  return 'NOT ASSESSED';
}

const SUGGESTED = [
  'What regulatory changes currently affect the Banking sector?',
  'How many open obligations are there?',
  'What Basel developments are linked to PRA implementation?',
  'Which obligations are linked to Banking changes?',
  'What regulatory changes currently affect the Banking sector, and which obligations are linked?',
];

function modeBadge(analysis) {
  if (!analysis) return '';
  if (analysis.providerMode === 'FIXTURE') return '<span class="ri-ai-mode ri-ai-mode--fixture">AI FIXTURE</span>';
  if (analysis.providerMode === 'OPENAI') return '<span class="ri-ai-mode ri-ai-mode--live">AI LIVE</span>';
  return '';
}

function resolveAskRetrieval(last) {
  if (!last) return null;
  const r = last.retrieval || last.analysis?.retrieval || null;
  if (!r) return null;
  if (!r.deterministicFacts?.predicateEvaluation && last.analysis?.retrieval?.deterministicFacts?.predicateEvaluation) {
    r.deterministicFacts = {
      ...(r.deterministicFacts || {}),
      ...last.analysis.retrieval.deterministicFacts,
    };
  }
  if (!r.predicateEvaluation && r.deterministicFacts?.predicateEvaluation) {
    r.predicateEvaluation = r.deterministicFacts.predicateEvaluation;
  }
  const pr = r.deterministicFacts?.predicateResult;
  if (!r.predicateEvaluation && pr?.predicateEvaluationComplete) {
    r.predicateEvaluation = {
      candidateCount: pr.candidateCount,
      qualifyingCount: pr.qualifyingCount,
      predicateEvaluationComplete: true,
      requestedTargetType: pr.targetType,
      anchorLabel: pr.anchorLabel,
    };
  }
  return r;
}

function resolvePredicateEvaluation(retrieval) {
  if (!retrieval) return null;
  return (
    retrieval.predicateEvaluation ||
    retrieval.deterministicFacts?.predicateEvaluation ||
    (retrieval.deterministicFacts?.predicateResult?.predicateEvaluationComplete
      ? {
          candidateCount: retrieval.deterministicFacts.predicateResult.candidateCount,
          qualifyingCount: retrieval.deterministicFacts.predicateResult.qualifyingCount,
          predicateEvaluationComplete: true,
          requestedTargetType: retrieval.deterministicFacts.predicateResult.targetType,
          anchorLabel: retrieval.deterministicFacts.predicateResult.anchorLabel,
        }
      : null)
  );
}

function evidenceReason(retrieval, id) {
  const display = retrieval?.displayReasons?.[id];
  if (display) return display;
  const raw = retrieval?.matchReasons?.[id] || '';
  if (/change_links_|_for_|obligation_has_|assessment_for/i.test(raw)) return id;
  return raw || id;
}

function renderEvidenceUsed(retrieval) {
  const pred = resolvePredicateEvaluation(retrieval);
  if (pred?.predicateEvaluationComplete) {
    const cand = pred.candidateCount ?? 0;
    const qual = pred.qualifyingCount ?? 0;
    const target = pred.requestedTargetType || 'Record';
    const anchor = pred.anchorLabel ? `${pred.anchorLabel} ` : '';
    const header = `<p class="ri-muted" data-ask-ri-evidence-count data-count="${qual}" data-candidate-count="${cand}" data-qualifying-count="${qual}" data-predicate-evaluated="true" data-displayed="${qual}" data-truncated="false"><strong>${qual} qualifying records</strong></p>`;
    const detail =
      qual === 0
        ? `<p class="ri-muted" data-ask-ri-zero-qualifiers="true">${cand} candidate ${anchor}${target}(s) were evaluated; none met the criteria.</p>`
        : `<p class="ri-muted">${qual} of ${cand} candidate ${anchor}${target}(s) met the criteria.</p>`;
    if (!retrieval?.matchedRecordIds?.length) {
      return `${header}${detail}`;
    }
    const rows = retrieval.matchedRecordIds
      .map(
        (id) =>
          `<li><strong>${esc(id)}</strong> (${esc(retrieval.recordTypes[id] || 'Record')}) — ${esc(evidenceReason(retrieval, id))}</li>`
      )
      .join('');
    return `${header}${detail}<ul class="ri-list">${rows}</ul>`;
  }

  const total = retrieval?.totalMatchingRecords ?? retrieval?.resultCount ?? retrieval?.matchedRecordIds?.length ?? 0;
  const shown = retrieval?.displayedEvidenceRecords ?? retrieval?.matchedRecordIds?.length ?? 0;
  const truncated = retrieval?.evidenceDisplayTruncated === true;
  const label = truncated
    ? `Evidence used: ${total} matching records · showing ${shown}`
    : `Evidence used: ${total} records`;
  const header = `<p class="ri-muted" data-ask-ri-evidence-count data-count="${total}" data-displayed="${shown}" data-truncated="${truncated}">${label}</p>`;
  if (!retrieval?.matchedRecordIds?.length) {
    return `${header}<p class="ri-muted">No RI records retrieved.</p>`;
  }
  const rows = retrieval.matchedRecordIds
    .map(
      (id) =>
        `<li><strong>${esc(id)}</strong> (${esc(retrieval.recordTypes[id] || 'Record')}) — ${esc(evidenceReason(retrieval, id))}</li>`
    )
    .join('');
  return `${header}<ul class="ri-list">${rows}</ul>`;
}

function renderAskResult(state, last) {
  if (!last) return '<p class="ri-muted">Ask a question to retrieve evidence-backed intelligence.</p>';
  if (last.unresolved) {
    const retrieval = resolveAskRetrieval(last);
    const interpreted = retrieval?.interpretedAs
      ? `<p class="ri-muted" data-ask-ri-interpreted-as><strong>Interpreted as:</strong> ${esc(retrieval.interpretedAs)}</p>`
      : '';
    const examples = (last.examples || SUPPORTED_QUESTION_EXAMPLES)
      .map((ex) => `<li>${esc(ex)}</li>`)
      .join('');
    return `<div data-ask-ri-result class="ri-ai-unresolved" data-ask-ri-unresolved="true" data-provider-calls="0">
      <p><strong>Could not safely interpret this question</strong></p>
      <p class="ri-muted">${esc(last.message || "I couldn't safely interpret this question.")}</p>
      ${interpreted}
      <p class="ri-muted">Supported question structures include:</p>
      <ul class="ri-list">${examples}</ul>
    </div>`;
  }
  if (last.insufficient) {
    return `<div data-ask-ri-result class="ri-ai-insufficient" data-ask-ri-insufficient="true" data-provider-calls="0">
      <p><strong>INSUFFICIENT RI EVIDENCE</strong></p>
      <p class="ri-muted">${esc(last.message || '')}</p>
      ${renderEvidenceUsed(resolveAskRetrieval(last))}
    </div>`;
  }
  if (last.zeroQualifiers) {
    const retrieval = resolveAskRetrieval(last);
    const interpreted = retrieval?.interpretedAs
      ? `<p class="ri-muted" data-ask-ri-interpreted-as><strong>Interpreted as:</strong> ${esc(retrieval.interpretedAs)}</p>`
      : '';
    const pred = resolvePredicateEvaluation(retrieval);
    const zeroCopy = pred?.predicateEvaluationComplete
      ? renderEvidenceUsed(retrieval)
      : `<p class="ri-muted" data-ask-ri-zero-qualifiers="true"><strong>0 qualifying records</strong></p>
         <p class="ri-muted">RI recognises the resolved scope, but no records match the requested criteria in the current dataset.</p>`;
    return `<div data-ask-ri-result data-ask-ri-zero-qualifiers="true" data-provider-calls="0">
      ${interpreted}
      ${zeroCopy}
      <p class="ri-muted">Evidence confidence: NOT ASSESSED · Provider calls: 0</p>
    </div>`;
  }
  const a = last.analysis;
  if (!a) return '';
  const askRetrieval = resolveAskRetrieval(last);
  const outdated =
    a.freshness === AI_FRESHNESS.OUTDATED
      ? '<p class="ri-ai-outdated">SOURCE CONTEXT HAS CHANGED · AI ANALYSIS OUTDATED · REVIEW MAY BE REQUIRED</p>'
      : '';
  const p = a.workflowPayload || a.originalAiOutput || {};
  const providerCalls = state._lastAskRiProviderCalls ?? 1;
  const asOfIso = askRetrieval?.deterministicFacts?.asOfDate;
  const asOfLabel = askRetrieval?.deterministicFacts?.asOfDateLabel;
  const asOfBanner = asOfLabel
    ? `<p class="ri-muted" data-ask-ri-as-of>Deterministic as-of date: <strong>${esc(asOfLabel)}</strong></p>`
    : '';
  const interpreted = askRetrieval?.interpretedAs
    ? `<p class="ri-muted" data-ask-ri-interpreted-as><strong>Interpreted as:</strong> ${esc(askRetrieval.interpretedAs)}</p>`
    : '';
  const actionFacts = askRetrieval?.deterministicFacts?.linkedActionStatuses || [];
  const actionStatusLine =
    actionFacts.length > 0
      ? `<p class="ri-muted">${actionFacts
          .map((a) => {
            const actionRec = { id: a.actionId, status: a.status, dueDate: a.dueDate };
            const overdueCopy = formatActionOverdueCustomerCopy(actionRec, asOfIso, asOfLabel);
            if (overdueCopy) return `${esc(overdueCopy)} (${esc(a.status)})`;
            return `${esc(a.actionId)}: ${esc(a.status)}`;
          })
          .join(' · ')}</p>`
      : '';
  const predEval = resolvePredicateEvaluation(resolveAskRetrieval(last));
  const supportedPredicate =
    predEval?.predicateEvaluationComplete ? ' data-ask-ri-supported-query="true"' : '';
  return `<div data-ask-ri-result data-provider-calls="${providerCalls}"${supportedPredicate}>
    ${modeBadge(a)}
    <span class="ri-ai-review">SOURCE-GROUNDED · ${esc(a.reviewStatus)} · HUMAN REVIEW REQUIRED</span>
    ${outdated}
    ${asOfBanner}
    ${interpreted}
    ${actionStatusLine}
    <p class="ri-muted">Evidence confidence: ${esc(formatEvidenceConfidence(a))} · Retrieved: ${esc(askRetrieval?.totalMatchingRecords ?? askRetrieval?.resultCount ?? 0)} matching records${askRetrieval?.evidenceDisplayTruncated ? ` · showing ${askRetrieval?.displayedEvidenceRecords ?? 0}` : ''}</p>
    <h4>Answer</h4>
    <p>${esc(p.answer || a.summary || '')}</p>
    <p class="ri-muted"><em>AI SYNTHESIS — not regulator wording</em></p>
    <h4>Key findings</h4>
    <ul>${(p.keyFindings || []).map((f) => `<li>${esc(f)}</li>`).join('') || '<li class="ri-muted">—</li>'}</ul>
    <h4>Uncertainties</h4>
    <ul>${(p.uncertainties || a.uncertainties || []).map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    <h4>Source evidence</h4>
    <ul>${(a.citations || []).map((c) => `<li>${esc(c.citationKind)} · ${esc(c.recordId || c.sourceRecordId)} — ${esc((c.excerpt || '').slice(0, 100))}</li>`).join('')}</ul>
  </div>`;
}

function renderComparePanel(state) {
  const cmp = (state.riAiAnalysisResults || []).find((a) => a.taskType === 'AI_TEXT_COMPARISON');
  const diff = cmp?.deterministicDiff || cmp?.workflowPayload?.deterministicDiff;
  const interp = cmp?.workflowPayload || {};
  return `<section class="ri-panel" data-ask-ri-compare>
    <h3>Compare regulatory versions</h3>
    <button type="button" class="ri-btn ri-btn--primary" data-ask-ri-compare>Run fixture comparison</button>
    ${diff ? `<div data-ask-ri-diff>
      <h4>Deterministic diff</h4>
      <p><strong>Added</strong></p><ul>${(diff.added || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p><strong>Removed</strong></p><ul>${(diff.removed || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <h4>AI interpretation</h4>
      <p>${esc(interp.interpretationSummary || '')}</p>
      <p class="ri-muted">${modeBadge(cmp)} SOURCE-GROUNDED</p>
    </div>` : ''}
  </section>`;
}

function renderBoardPanel(state) {
  const sum = (state.riAiAnalysisResults || []).find((a) => a.taskType === 'AI_EXECUTIVE_SUMMARY');
  const canReview = canApproveExecutiveSummary(state);
  const p = sum?.workflowPayload || {};
  return `<section class="ri-panel" data-ask-ri-board>
    <h3>Board regulatory summary</h3>
    <button type="button" class="ri-btn ri-btn--primary" data-ask-ri-board ${canAskRi(state) ? '' : 'disabled'}>Generate board summary (AI draft)</button>
    ${sum ? `<div data-ask-ri-board-result>
      ${modeBadge(sum)}
      <p>Status: ${esc(sum.reviewStatus)} · Period: ${esc(sum.reportingPeriod || '')}</p>
      <p>${esc((p.materialDevelopments || []).join('; '))}</p>
      ${canReview && sum.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED ? `<button type="button" class="ri-btn ri-btn--ghost" data-ask-ri-board-accept data-analysis-id="${esc(sum.analysisId)}">Mark reviewed (demo)</button>` : ''}
      ${isAuditorReadOnly(state) ? '<p class="ri-muted">Auditor: read-only — cannot approve summaries.</p>' : ''}
    </div>` : ''}
  </section>`;
}

export function renderAskRiPage(state, { lastAsk } = {}) {
  const canQuery = canAskRi(state);
  const suggestions = SUGGESTED.map(
    (q) => `<button type="button" class="ri-btn ri-btn--ghost ri-btn--sm" data-ask-ri-suggest>${esc(q)}</button>`
  ).join(' ');
  const last = lastAsk || state._lastAskRi;
  const retrieval = resolveAskRetrieval(last);
  return `${pageHeader('Ask RI', 'Evidence-backed regulatory intelligence — not a generic chatbot.')}
  <section class="ri-panel ri-ask-ri" data-ask-ri-panel>
    <h2>Ask RI</h2>
    <p class="ri-muted">Retrieval runs before AI. Answers use verified official sources and approved RI records only.</p>
    <div class="ri-ask-ri-form">
      <label for="ask-ri-input">Question</label>
      <textarea id="ask-ri-input" rows="3" class="ri-input" ${canQuery ? '' : 'disabled'}></textarea>
      <button type="button" class="ri-btn ri-btn--primary" data-ask-ri-submit ${canQuery ? '' : 'disabled'}>Ask</button>
    </div>
    <div class="ri-ask-ri-suggestions"><p class="ri-muted">Suggested questions</p>${suggestions}</div>
    <h3>Evidence used</h3>
    <div data-ask-ri-evidence>${renderEvidenceUsed(retrieval)}</div>
    ${renderAskResult(state, last)}
  </section>
  ${renderComparePanel(state)}
  ${renderBoardPanel(state)}`;
}

function pageHeader(title, subtitle) {
  return `<header class="ri-page-header"><h1>${esc(title)}</h1><p class="ri-muted">${esc(subtitle)}</p></header>`;
}
