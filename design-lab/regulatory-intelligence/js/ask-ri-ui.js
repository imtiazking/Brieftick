import { esc } from './components.js';
import { AI_FRESHNESS, AI_REVIEW_STATUS } from './ai/enums.js';
import { canAskRi, canApproveExecutiveSummary, isAuditorReadOnly } from './ai/persona-ai.js';

const SUGGESTED = [
  'What regulatory changes currently affect the Banking sector?',
  'How many open obligations are there?',
  'What Basel developments are linked to PRA implementation?',
  'What is the capital requirement under EU CRD V in France?',
  'cryptoassets-only-special-sector-xyz regulatory changes',
];

function modeBadge(analysis) {
  if (!analysis) return '';
  if (analysis.providerMode === 'FIXTURE') return '<span class="ri-ai-mode ri-ai-mode--fixture">AI FIXTURE</span>';
  if (analysis.providerMode === 'OPENAI') return '<span class="ri-ai-mode ri-ai-mode--live">AI LIVE</span>';
  return '';
}

function renderEvidenceUsed(retrieval) {
  if (!retrieval?.matchedRecordIds?.length) {
    return '<p class="ri-muted">No RI records retrieved.</p>';
  }
  const rows = retrieval.matchedRecordIds
    .map(
      (id) =>
        `<li><strong>${esc(id)}</strong> (${esc(retrieval.recordTypes[id] || 'Record')}) — ${esc(retrieval.matchReasons[id] || '')}</li>`
    )
    .join('');
  return `<ul class="ri-list">${rows}</ul>`;
}

function renderAskResult(state, last) {
  if (!last) return '<p class="ri-muted">Ask a question to retrieve evidence-backed intelligence.</p>';
  if (last.insufficient) {
    return `<div data-ask-ri-result class="ri-ai-insufficient">
      <p><strong>INSUFFICIENT RI EVIDENCE</strong></p>
      <p class="ri-muted">${esc(last.message || '')}</p>
      <p class="ri-muted">Evidence used: ${last.retrieval?.resultCount || 0} records</p>
      ${renderEvidenceUsed(last.retrieval)}
    </div>`;
  }
  const a = last.analysis;
  if (!a) return '';
  const outdated =
    a.freshness === AI_FRESHNESS.OUTDATED
      ? '<p class="ri-ai-outdated">SOURCE CONTEXT HAS CHANGED · AI ANALYSIS OUTDATED · REVIEW MAY BE REQUIRED</p>'
      : '';
  const p = a.workflowPayload || a.originalAiOutput || {};
  return `<div data-ask-ri-result>
    ${modeBadge(a)}
    <span class="ri-ai-review">SOURCE-GROUNDED · ${esc(a.reviewStatus)} · HUMAN REVIEW REQUIRED</span>
    ${outdated}
    <p class="ri-muted">Evidence confidence: ${esc(a.evidenceConfidence)} · Retrieved: ${esc(last.retrieval?.resultCount ?? 0)} records</p>
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
  const retrieval = last?.retrieval;
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
