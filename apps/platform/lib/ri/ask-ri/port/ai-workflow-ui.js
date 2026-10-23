import { esc } from './components.js';
import { AI_REVIEW_STATUS, AI_FRESHNESS } from './ai/enums.js';
import { analysesForEntity } from './ai/workflow-ai-service.js';
import { canCreateAiWorkflowDrafts, canMutateAiReviewState, isAuditorReadOnly } from './ai/persona-ai.js';

function modeBadge(analysis) {
  if (analysis.providerMode === 'FIXTURE') return '<span class="ri-ai-mode ri-ai-mode--fixture">AI FIXTURE</span>';
  if (analysis.providerMode === 'OPENAI') return '<span class="ri-ai-mode ri-ai-mode--live">AI LIVE</span>';
  return '';
}

function renderWorkflowResult(analysis, { canDraft, canReview, auditorReadOnly }) {
  if (!analysis) return '<p class="ri-muted">No AI workflow result yet.</p>';
  const p = analysis.workflowPayload || analysis.originalAiOutput || {};
  const outdated =
    analysis.freshness === AI_FRESHNESS.OUTDATED
      ? '<p class="ri-ai-outdated">SOURCE CONTEXT HAS CHANGED · AI ANALYSIS OUTDATED</p>'
      : '';
  const actions =
    canReview && analysis.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED
      ? `<div class="ri-ai-review-actions">
      <button type="button" class="ri-btn ri-btn--primary" data-ai-wf-accept data-wf-kind="${esc(analysis.taskType)}" data-analysis-id="${esc(analysis.analysisId)}">Create draft</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-ai-wf-reject data-analysis-id="${esc(analysis.analysisId)}">Reject</button>
    </div>`
      : '';
  return `
    <div data-ai-wf-result>
      ${modeBadge(analysis)}
      <span class="ri-ai-review">SOURCE-GROUNDED · ${esc(analysis.reviewStatus)}</span>
      ${outdated}
      <p class="ri-muted">Evidence confidence: ${esc(analysis.evidenceConfidence)}</p>
      <p>${esc(analysis.summary || p.impactSummary || '')}</p>
      <pre class="ri-muted ri-mono" style="white-space:pre-wrap">${esc(JSON.stringify(p, null, 0).slice(0, 1200))}</pre>
      ${canDraft ? actions : auditorReadOnly ? '<p class="ri-muted">Auditor: read-only</p>' : ''}
    </div>`;
}

export function renderChangeAnalysisPanel(publicationId, state) {
  const analyses = analysesForEntity(state, 'Publication', publicationId).filter((a) => a.taskType === 'AI_CHANGE_ANALYSIS');
  const current = analyses[0];
  const canDraft = canCreateAiWorkflowDrafts(state);
  return `
    <section class="ri-panel ri-ai-summary-panel" data-ai-change-panel data-pub-id="${esc(publicationId)}">
      <h3>AI Change Analysis</h3>
      <p class="ri-muted">AI MATERIALITY SUGGESTION · HUMAN REVIEW REQUIRED</p>
      ${canDraft ? `<button type="button" class="ri-btn ri-btn--primary" data-ai-change-analyse data-pub-id="${esc(publicationId)}">Analyse regulatory change</button>` : ''}
      ${renderWorkflowResult(current, { canDraft, canReview: canMutateAiReviewState(state), auditorReadOnly: isAuditorReadOnly(state) })}
    </section>`;
}

export function renderChangeIaPanel(changeId, state) {
  const analyses = analysesForEntity(state, 'Change', changeId).filter((a) => a.taskType === 'AI_IMPACT_ASSESSMENT');
  const current = analyses[0];
  const canDraft = canCreateAiWorkflowDrafts(state);
  return `
    <section class="ri-panel" data-ai-ia-panel data-change-id="${esc(changeId)}">
      <h3>Impact assessment (AI assist)</h3>
      ${canDraft ? `<button type="button" class="ri-btn ri-btn--primary" data-ai-ia-generate data-change-id="${esc(changeId)}">Draft impact assessment with AI</button>` : ''}
      ${renderWorkflowResult(current, { canDraft, canReview: canMutateAiReviewState(state), auditorReadOnly: isAuditorReadOnly(state) })}
    </section>`;
}

export function renderIaObligationPanel(assessmentId, state) {
  const analyses = analysesForEntity(state, 'ImpactAssessment', assessmentId).filter((a) => a.taskType === 'AI_OBLIGATION_SUGGESTION');
  const current = analyses[0];
  const canDraft = canCreateAiWorkflowDrafts(state);
  return `
    <section class="ri-panel" data-ai-obl-panel data-assessment-id="${esc(assessmentId)}">
      <h3>Obligation suggestions (AI)</h3>
      ${canDraft ? `<button type="button" class="ri-btn ri-btn--primary" data-ai-obl-generate data-assessment-id="${esc(assessmentId)}">Suggest obligations with AI</button>` : ''}
      ${renderWorkflowResult(current, { canDraft, canReview: canMutateAiReviewState(state), auditorReadOnly: isAuditorReadOnly(state) })}
    </section>`;
}
