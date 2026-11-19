/**
 * Connected AI governance — human review of persisted analysis runs (no live Ask RI).
 */
import { esc, badge } from '../components.js';
import { getState } from '../store.js';
import { isConnectedAiReviewEnabled } from './connected-mode.js';
import { notify } from '../store.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

export async function fetchConnectedAiAnalysisRun(state, runId) {
  const base = apiBase(state);
  const res = await fetch(`${base}/ai-analysis-runs/${encodeURIComponent(runId)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'ai_run_unavailable');
  return body;
}

export async function submitConnectedAiReview(state, runId, payload) {
  if (!isConnectedAiReviewEnabled(state)) throw new Error('connected_writes_disabled');
  const base = apiBase(state);
  const res = await fetch(`${base}/ai-analysis-runs/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'ai_review_failed');
  notify();
  return body;
}

export function renderConnectedAiReviewPanel(run) {
  if (!run?.id || !isConnectedAiReviewEnabled(getState())) return '';
  const review = String(run.reviewStatus || run.review_status || '').toUpperCase();
  if (['ACCEPTED', 'REJECTED', 'PARTIALLY_ACCEPTED', 'SUPERSEDED'].includes(review)) {
    return `<p class="ri-muted">Review decision recorded: <strong>${esc(review)}</strong></p>`;
  }
  return `<section class="ri-panel" data-connected-ai-review="${esc(run.id)}">
    <h3>Human review (connected)</h3>
    <p class="ri-muted">Review persisted AI output — provenance and citations shown below. New live executions remain disabled in connected staging. Do not accept findings with unresolved evidence without explicit reviewer judgement.</p>
    <label>Decision
      <select data-connected-ai-review-decision>
        <option value="ACCEPTED">Accept</option>
        <option value="PARTIALLY_ACCEPTED">Partially accept</option>
        <option value="REJECTED">Reject</option>
      </select>
    </label>
    <label>Notes <textarea data-connected-ai-review-notes rows="2"></textarea></label>
    <button type="button" class="ri-btn ri-btn--primary" data-connected-ai-review-submit>Submit review</button>
  </section>`;
}

function renderExternalSourceLink(cite) {
  const url = cite.publicationSourceUrl;
  if (!url) return '';
  const label = cite.regulatorAcronym
    ? `${cite.regulatorAcronym} publication (external)`
    : 'Original regulator publication (external)';
  return `<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></p>`;
}

function renderCitationSectionBlock(cite, section) {
  const pubLink = `<a href="${esc(cite.publicationHref)}">${esc(cite.publicationTitle || cite.publicationId.slice(0, 8) + '…')}</a>`;
  const sourceTab = `<a href="${esc(cite.sourceTabHref)}">Open publication source in Design Lab</a>`;
  if (!section.resolved) {
    return `<li class="ri-alert">${esc(section.resolutionNote || 'Evidence could not be resolved.')}</li>`;
  }
  const label = section.citationLabel || section.sourceSectionId;
  const citeLink = `<a href="${esc(cite.sourceTabHref)}">${esc(label)}</a>`;
  return `<li>
    <p><strong>${citeLink}</strong> · ${pubLink} · ${sourceTab}</p>
    ${section.excerpt ? `<blockquote class="ri-read ri-read--compact">${esc(section.excerpt)}</blockquote>` : ''}
  </li>`;
}

export function renderConnectedAiRunCitations(citations = [], publicationSource = null) {
  if (!citations.length) {
    return '<p class="ri-muted">No persisted citations for this run.</p>';
  }
  const pubIntro = publicationSource?.publicationTitle
    ? `<p class="ri-muted">Regulatory source: <a href="#/publication/${esc(publicationSource.publicationId)}">${esc(publicationSource.publicationTitle)}</a>${
        publicationSource.sourceUrl
          ? ` · <a href="${esc(publicationSource.sourceUrl)}" target="_blank" rel="noopener noreferrer">FCA source</a>`
          : ''
      }</p>`
    : '';

  const blocks = citations.map((cite) => {
    const idx = cite.claimIndex ?? cite.claim_index ?? 0;
    const status = cite.citationStatus || cite.citation_status || 'UNKNOWN';
    const supportBadge = cite.evidenceSupported
      ? badge('Supported')
      : badge('Review evidence');
    const warn = cite.evidenceWarning
      ? `<p class="ri-alert ri-alert--readonly">${esc(cite.evidenceWarning)}</p>`
      : '';
    const sections = (cite.sections || []).length
      ? cite.sections
      : (cite.sourceSectionIds || cite.source_section_ids || []).map((sid) => ({
          sourceSectionId: sid,
          resolved: false,
          resolutionNote: `Section ${sid} — no resolved excerpt (legacy API row).`,
          citationLabel: null,
          excerpt: null,
        }));
    return `<article class="ri-panel ri-panel--compact" data-citation-claim="${idx}">
      <h4>Finding ${idx + 1} supporting evidence ${supportBadge}</h4>
      <p class="ri-muted">${badge(status)}${
        cite.confidence != null ? ` · AI confidence ${esc(String(cite.confidence))}%` : ''
      }</p>
      ${warn}
      <ul class="ri-list-compact">${sections.map((s) => renderCitationSectionBlock(cite, s)).join('')}</ul>
      ${renderExternalSourceLink(cite)}
    </article>`;
  });

  return `<section class="ri-panel"><h3>Citations &amp; provenance</h3>
    ${pubIntro}
    ${blocks.join('')}
  </section>`;
}

export function renderConnectedAiRunDetail(body) {
  const detail = body?.detail || body?.aiAnalysisRun;
  const so = detail?.structured_output || detail?.structuredOutput;
  const claims = so && Array.isArray(so.claims) ? so.claims : [];
  const candidates = so && Array.isArray(so.candidates) ? so.candidates : [];
  const outputItems = claims.length ? claims : candidates;
  const citations = body.citations || [];
  const publicationSource = body.publicationSource || null;

  const claimsHtml = outputItems.length
    ? `<section class="ri-panel"><h3>Analysis findings</h3><ol>${outputItems
        .map((c, i) => {
          const text =
            (typeof c.text === 'string' && c.text) ||
            (typeof c.statement === 'string' && c.statement) ||
            (typeof c.summary === 'string' && c.summary) ||
            JSON.stringify(c);
          const cite = citations.find((x) => (x.claimIndex ?? x.claim_index) === i);
          const ev = cite?.evidenceSupported
            ? ` <span class="ri-muted">(${esc('Source evidence resolved')})</span>`
            : cite
              ? ` <span class="ri-alert ri-alert--readonly ri-inline">(${esc('Evidence requires review')})</span>`
              : '';
          return `<li><strong>Finding ${i + 1}</strong> — ${esc(text)}${ev}</li>`;
        })
        .join('')}</ol></section>`
    : so?.classification
      ? `<section class="ri-panel"><h3>Analysis findings</h3><p>${esc(String(so.classification))}</p></section>`
      : '<p class="ri-muted">No structured claims on this run.</p>';

  return `${claimsHtml}${renderConnectedAiRunCitations(citations, publicationSource)}`;
}
