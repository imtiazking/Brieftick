import { esc } from './components.js';
import { formatDate } from './components.js';
import { AI_FRESHNESS, AI_REVIEW_STATUS } from './ai/enums.js';

function modeBadge(analysis) {
  if (analysis.providerMode === 'FIXTURE') return '<span class="ri-ai-mode ri-ai-mode--fixture">AI FIXTURE</span>';
  if (analysis.providerMode === 'OPENAI') return '<span class="ri-ai-mode ri-ai-mode--live">AI LIVE</span>';
  return '<span class="ri-ai-mode">AI</span>';
}

function safeText(value) {
  return esc(value ?? '');
}

export function renderAiSummaryPanel(publicationId, state, { canGenerate, canReview, isAuditor }) {
  const analyses = (state.riAiAnalysisResults || [])
    .filter((a) => a.entityId === publicationId || a.contextRecordIds?.includes(publicationId))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const current = analyses[0];

  const history = analyses
    .map(
      (a) => `<li>
        <strong>${safeText(a.createdAt)}</strong> · ${modeBadge(a)}
        · ${safeText(a.reviewStatus)} · ${safeText(a.freshness)}
        · ${safeText(a.evidenceConfidence)}
      </li>`
    )
    .join('');

  const outdated =
    current?.freshness === AI_FRESHNESS.OUTDATED
      ? '<p class="ri-ai-outdated">OUTDATED · SOURCE CHANGED · REANALYSIS RECOMMENDED</p>'
      : '';

  const sections = current?.sections || {};
  const body = current
    ? `
    <div class="ri-ai-summary-result" data-ai-summary-result>
      ${modeBadge(current)}
      <span class="ri-ai-review">${safeText(current.reviewStatus)}</span>
      <span class="ri-ai-freshness">${safeText(current.freshness)}</span>
      ${outdated}
      <p class="ri-muted">Evidence confidence: ${safeText(current.evidenceConfidence)} · ${safeText(current.createdAt)}</p>
      <h4>WHAT IS THIS?</h4><p>${safeText(sections.whatIsThis || current.summary)}</p>
      <h4>WHAT CHANGED?</h4><p>${safeText(sections.whatChanged)}</p>
      <h4>WHO MAY BE AFFECTED?</h4><p>${safeText(sections.whoMayBeAffected)}</p>
      <h4>KEY DATES</h4><ul>${(sections.keyDates || []).map((d) => `<li>${safeText(d)}</li>`).join('')}</ul>
      <h4>KEY POINTS</h4><ul>${(sections.keyPoints || current.findings || []).map((d) => `<li>${safeText(d)}</li>`).join('')}</ul>
      <h4>AREAS REQUIRING REVIEW</h4><ul>${(sections.areasRequiringReview || []).map((d) => `<li>${safeText(d)}</li>`).join('')}</ul>
      <h4>UNCERTAINTIES</h4><ul>${(sections.uncertainties || current.uncertainties || []).map((d) => `<li>${safeText(d)}</li>`).join('')}</ul>
      <h4>SOURCE EVIDENCE</h4>
      <ul class="ri-ai-citations">
        ${(current.citations || [])
          .map((c) => {
            if (c.citationKind === 'OFFICIAL_SOURCE') {
              const url = c.canonicalUrl ? `<a href="${safeText(c.canonicalUrl)}" rel="noopener noreferrer">${safeText(c.canonicalUrl)}</a>` : '';
              return `<li><strong>OFFICIAL_SOURCE</strong> ${safeText(c.sourceRecordId)} ${url}<br><em>${safeText(c.excerpt)}</em></li>`;
            }
            return `<li><strong>RI_RECORD</strong> ${safeText(c.recordType)} ${safeText(c.recordId)}
              <a href="${safeText(c.internalRoute)}">internal route</a><br><em>${safeText(c.excerpt)}</em></li>`;
          })
          .join('')}
      </ul>
      ${
        canReview && current.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED
          ? `<div class="ri-ai-review-actions">
        <button type="button" class="ri-btn ri-btn--primary" data-ai-summary-accept data-analysis-id="${safeText(current.analysisId)}">Accept summary</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-ai-summary-reject data-analysis-id="${safeText(current.analysisId)}">Reject summary</button>
      </div>`
          : ''
      }
    </div>`
    : '<p class="ri-muted">No AI Summary generated yet.</p>';

  const genBtn = canGenerate
    ? `<button type="button" class="ri-btn ri-btn--primary" data-ai-summary-generate data-pub-id="${safeText(publicationId)}">Generate AI Summary</button>
       <button type="button" class="ri-btn ri-btn--ghost" data-ai-summary-generate-live data-pub-id="${safeText(publicationId)}">Generate (live bridge)</button>`
    : isAuditor
      ? '<p class="ri-muted">Auditor: read-only</p>'
      : '';

  return `
  <section class="ri-panel ri-ai-summary-panel" data-ai-summary-panel data-pub-id="${safeText(publicationId)}">
    <header class="ri-panel__head"><h3>AI Summary</h3><p class="ri-muted">Source-grounded · human review required</p></header>
    ${genBtn}
    ${body}
    <h4 class="ri-subhead">AI history</h4>
    <ul class="ri-ai-history">${history || '<li class="ri-muted">None</li>'}</ul>
  </section>`;
}
