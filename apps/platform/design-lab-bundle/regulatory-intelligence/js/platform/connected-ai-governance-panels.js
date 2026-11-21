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
  const execution = String(run.executionStatus || run.execution_status || '').toUpperCase();
  if (execution && execution !== 'COMPLETED') {
    return `<p class="ri-muted">This run did not complete (${esc(execution)}), so there is no AI output to review. The run is retained for audit.</p>`;
  }
  const acceptanceSuspended = run.useCaseId === 'UC-RI-005';
  return `<section class="ri-panel" data-connected-ai-review="${esc(run.id)}">
    <h3>Human review (connected)</h3>
    <p class="ri-muted">Review persisted AI output — provenance and citations shown below. New live executions remain disabled in connected staging. Do not accept findings with unresolved evidence without explicit reviewer judgement.</p>
    ${
      acceptanceSuspended
        ? '<p class="ri-callout" data-connected-ai-review-suspended>Obligation-extraction output cannot be accepted as a whole. Accept or reject individual findings in the per-finding review below; use this form only to reject the entire run.</p>'
        : ''
    }
    <label>Decision
      <select data-connected-ai-review-decision>
        ${acceptanceSuspended ? '' : '<option value="ACCEPTED">Accept</option><option value="PARTIALLY_ACCEPTED">Partially accept</option>'}
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

// UC-RI-005 per-finding review. Server rules (ri_submit_ai_finding_review) are authoritative; these mirror
// them so the reviewer sees what is missing before submitting.
const FINDING_MIN_QUOTATION = 20;
const FINDING_MIN_UAT_JUSTIFICATION = 20;
/** Unsubmitted reviewer input per run, so store-driven re-renders do not discard it. */
const findingReviewDrafts = new Map();

export function renderConnectedAiFindingReviewPlaceholder(run) {
  if (!run?.id || run.useCaseId !== 'UC-RI-005') return '';
  if (String(run.executionStatus || '').toUpperCase() !== 'COMPLETED') return '';
  return `<div data-connected-ai-finding-review-load="${esc(run.id)}" class="ri-muted">Loading per-finding review…</div>`;
}

export async function fetchConnectedAiFindingReview(state, runId) {
  const res = await fetch(`${apiBase(state)}/ai-analysis-runs/${encodeURIComponent(runId)}/findings`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'finding_review_unavailable');
  return body;
}

export async function submitConnectedAiFindingReview(state, runId, payload) {
  if (!isConnectedAiReviewEnabled(state)) throw new Error('connected_writes_disabled');
  const res = await fetch(`${apiBase(state)}/ai-analysis-runs/${encodeURIComponent(runId)}/findings`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatFindingReviewError(body.detail || body.reason || body.error));
  notify();
  return body;
}

const FINDING_REVIEW_ERRORS = {
  finding_quotation_not_found_on_page: 'the quotation was not found word for word on the selected PDF page',
  finding_quotation_page_not_cited: 'the selected page is not one of the finding’s cited pages',
  finding_text_mismatch: 'the finding text changed — reload the page',
  finding_justification_required: `a reviewer justification of at least ${FINDING_MIN_UAT_JUSTIFICATION} characters is required`,
  finding_legal_basis_required: 'a legal basis is required',
  finding_citation_unverified: 'the citation is not verified, so it cannot become an obligation',
};

function formatFindingReviewError(code) {
  const text = String(code || 'finding_review_failed');
  const [key, finding] = text.split(':');
  if (FINDING_REVIEW_ERRORS[key]) return `Finding ${finding}: ${FINDING_REVIEW_ERRORS[key]}.`;
  if (text === 'segregation_of_duties') return 'You requested this AI run, so a different reviewer must review it.';
  if (text === 'already_reviewed') return 'This run has already been reviewed.';
  if (text === 'uc_ri_005_finding_review_disabled') return 'Per-finding review is not enabled on this environment.';
  return text;
}

function classificationOptions(classifications, selected) {
  return [`<option value="">Select classification…</option>`]
    .concat(
      classifications.map(
        (c) =>
          `<option value="${esc(c.id)}" data-creates-obligation="${c.createsObligation ? '1' : '0'}"${c.id === selected ? ' selected' : ''}>${esc(c.label)}${
            c.createsObligation ? ' — creates DRAFT obligation' : ''
          }</option>`,
      ),
    )
    .join('');
}

function renderRecordedFindingDecisions(body) {
  const byIndex = new Map(body.findings.map((f) => [f.claimIndex, f]));
  const rows = body.decisions.map((d) => {
    const f = byIndex.get(d.claim_index);
    const outcome = d.obligation_id
      ? `DRAFT obligation <a href="#/obligation/${esc(d.obligation_id)}">${esc(d.obligation_id.slice(0, 8))}…</a>`
      : d.skip_reason
        ? `Not an obligation (${esc(d.skip_reason.replace('classification_not_obligation:', ''))})`
        : '—';
    return `<tr data-finding-decision-row="${esc(d.finding_id)}">
      <td>${esc(String(d.claim_index + 1))}</td>
      <td>${esc(f?.statement || '')}</td>
      <td>${badge(d.decision)}</td>
      <td>${esc(d.classification || '—')}</td>
      <td>${d.quotation_page ? `p.${esc(String(d.quotation_page))}` : '—'}</td>
      <td>${outcome}</td>
      <td>${esc(d.reviewer_comment || '')}</td>
    </tr>`;
  });
  return `<section class="ri-panel" data-connected-ai-finding-review-recorded>
    <h3>Per-finding review decisions</h3>
    <p class="ri-muted">Evidence pathway: <strong>${esc(body.decisions[0]?.evidence_pathway || '—')}</strong>. DRAFT obligations require submission and independent approval by a reviewer who is neither the AI requester nor the acceptor.</p>
    <table class="ri-table"><thead><tr><th>#</th><th>Finding</th><th>Decision</th><th>Classification</th><th>Page</th><th>Outcome</th><th>Reviewer comment</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
  </section>`;
}

function renderFindingCard(f, classifications, canReview, draft = {}) {
  const suggestion = f.suggestion;
  const name = `finding-decision-${f.findingId}`;
  const disabled = canReview ? '' : ' disabled';
  const checked = (value) => (draft.decision === value ? ' checked' : '');
  return `<article class="ri-panel ri-panel--compact ri-finding-review" data-finding-review-item="${esc(f.findingId)}"
      data-claim-sha="${esc(f.claimTextSha256)}" data-finding-number="${esc(String(f.number))}">
    <h4>Finding ${esc(String(f.number))}</h4>
    <p data-finding-statement><strong>Statement:</strong> ${esc(f.statement)}</p>
    <dl class="ri-dl">
      <dt>Citation verification</dt><dd>${badge(f.citationStatus)} <span class="ri-muted">(cited section is one of the analysed PDF sections; the wording still needs checking)</span></dd>
      <dt>Cited PDF pages</dt><dd data-finding-pages>${f.pages.map((p) => `p.${esc(String(p))}`).join(', ') || '—'}</dd>
      <dt>Model suggestion</dt><dd>${esc(suggestion?.modelBindingNature || 'none')}${
        f.modelConfidence != null ? ` · confidence ${esc(String(f.modelConfidence))}%` : ''
      } <span class="ri-muted">— verify against the PDF</span></dd>
    </dl>
    ${
      suggestion?.sourceQuotation
        ? `<details><summary>Model-suggested quotation${suggestion.citation ? ` (${esc(suggestion.citation)})` : ''} — verify against the PDF</summary>
            <blockquote class="ri-read ri-read--compact" data-finding-suggested-quotation>${esc(suggestion.sourceQuotation)}</blockquote>
            ${canReview ? '<button type="button" class="ri-btn" data-finding-use-suggestion>Copy into supporting quotation</button>' : ''}
          </details>`
        : ''
    }
    <fieldset class="ri-finding-review__decision"><legend>Decision</legend>
      <label><input type="radio" name="${esc(name)}" value="ACCEPTED" data-finding-decision${checked('ACCEPTED')}${disabled}> Accept</label>
      <label><input type="radio" name="${esc(name)}" value="REJECTED" data-finding-decision${checked('REJECTED')}${disabled}> Reject</label>
    </fieldset>
    <label>Regulatory classification
      <select data-finding-classification${disabled}>${classificationOptions(classifications, draft.classification)}</select>
    </label>
    <label>Legal basis <input type="text" data-finding-legal-basis placeholder="e.g. PSRs 2017 regulation 86(2C)" value="${esc(draft.legalBasis || '')}"${disabled}></label>
    <label>Supporting quotation (exact text from the PDF)
      <textarea data-finding-quotation rows="3"${disabled}>${esc(draft.quotation || '')}</textarea>
    </label>
    <label>PDF page
      <select data-finding-page${disabled}><option value="">Select page…</option>${f.pages
        .map((p) => `<option value="${esc(String(p))}"${String(p) === draft.page ? ' selected' : ''}>p.${esc(String(p))}</option>`)
        .join('')}</select>
    </label>
    <label>Reviewer comment
      <textarea data-finding-comment rows="2"${disabled}>${esc(draft.comment || '')}</textarea>
    </label>
    <p class="ri-muted" data-finding-outcome>Decision required.</p>
  </article>`;
}

export function renderConnectedAiFindingReviewPanel(body, state = getState()) {
  if (body.decisions?.length) return renderRecordedFindingDecisions(body);
  const unreviewed = ['HUMAN_REVIEW_REQUIRED', 'AI_DRAFT'].includes(String(body.reviewStatus || '').toUpperCase());
  if (!unreviewed) return '';
  const canReview = body.enabled === true && isConnectedAiReviewEnabled(state);
  const uat = body.evidence?.pathway === 'human_verified_uat';
  const drafts = canReview ? findingReviewDrafts.get(body.runId) : null;
  return `<section class="ri-panel" data-connected-ai-finding-review="${esc(body.runId)}" data-evidence-pathway="${esc(body.evidence?.pathway || '')}">
    <h3>Per-finding review</h3>
    <p class="ri-muted">Decide every finding against the original FCA PDF. Only accepted findings classified as a binding requirement or guidance on a binding requirement create obligations, and only as DRAFT. Permissions, scope exclusions, definitions, safe harbours and explanatory statements are recorded but never become obligations.</p>
    ${
      uat
        ? `<p class="ri-callout" data-finding-review-uat-pathway>Human-verified UAT pathway: this PDF extraction is not rated obligation-grade. An obligation needs an exact quotation that the server matches against the selected PDF page, a legal basis and a reviewer justification of at least ${FINDING_MIN_UAT_JUSTIFICATION} characters.</p>`
        : ''
    }
    ${
      body.enabled === true
        ? ''
        : '<p class="ri-callout" data-finding-review-disabled>Per-finding review is not enabled on this environment yet. The findings are shown read-only.</p>'
    }
    ${body.findings
      .map((f) => renderFindingCard(f, body.classifications || [], canReview, drafts?.cards?.[f.findingId]))
      .join('')}
    ${
      canReview
        ? `<label>Overall review notes <textarea data-finding-review-notes rows="2">${esc(drafts?.notes || '')}</textarea></label>
           <p data-finding-review-progress class="ri-muted"></p>
           <button type="button" class="ri-btn ri-btn--primary" data-finding-review-submit disabled>Submit per-finding review</button>`
        : ''
    }
  </section>`;
}

function readFindingCard(card, uat) {
  const decision = card.querySelector('[data-finding-decision]:checked')?.value || '';
  const classificationSelect = card.querySelector('[data-finding-classification]');
  const option = classificationSelect?.selectedOptions?.[0];
  const classification = classificationSelect?.value || '';
  const createsObligation = decision === 'ACCEPTED' && option?.dataset?.createsObligation === '1';
  const legalBasis = card.querySelector('[data-finding-legal-basis]')?.value.trim() || '';
  const quotation = card.querySelector('[data-finding-quotation]')?.value.trim() || '';
  const page = card.querySelector('[data-finding-page]')?.value || '';
  const comment = card.querySelector('[data-finding-comment]')?.value.trim() || '';
  const missing = [];
  if (!decision) missing.push('decision');
  if (decision === 'ACCEPTED' && !classification) missing.push('classification');
  if (createsObligation) {
    if (legalBasis.length < 3) missing.push('legal basis');
    if (quotation.length < FINDING_MIN_QUOTATION) missing.push('exact quotation');
    if (!page) missing.push('PDF page');
  }
  if (!comment) missing.push('comment');
  else if (createsObligation && uat && comment.length < FINDING_MIN_UAT_JUSTIFICATION) {
    missing.push(`justification (${FINDING_MIN_UAT_JUSTIFICATION}+ characters)`);
  }
  return {
    missing,
    createsObligation,
    payload: {
      findingId: card.getAttribute('data-finding-review-item'),
      claimTextSha256: card.getAttribute('data-claim-sha'),
      decision,
      classification: classification || null,
      legalBasis: createsObligation ? legalBasis : null,
      quotation: createsObligation ? quotation : null,
      quotationPage: createsObligation ? Number(page) : null,
      comment,
    },
  };
}

function syncFindingReviewPanel(panel) {
  const uat = panel.getAttribute('data-evidence-pathway') === 'human_verified_uat';
  const cards = [...panel.querySelectorAll('[data-finding-review-item]')];
  const saved = { cards: {}, notes: panel.querySelector('[data-finding-review-notes]')?.value || '' };
  let complete = 0;
  let drafts = 0;
  for (const card of cards) {
    const r = readFindingCard(card, uat);
    saved.cards[r.payload.findingId] = {
      decision: r.payload.decision,
      classification: r.payload.classification || '',
      legalBasis: card.querySelector('[data-finding-legal-basis]')?.value || '',
      quotation: card.querySelector('[data-finding-quotation]')?.value || '',
      page: card.querySelector('[data-finding-page]')?.value || '',
      comment: card.querySelector('[data-finding-comment]')?.value || '',
    };
    const evidenceFields = card.querySelectorAll('[data-finding-legal-basis], [data-finding-quotation], [data-finding-page]');
    evidenceFields.forEach((el) => {
      el.disabled = !r.createsObligation;
    });
    const classification = card.querySelector('[data-finding-classification]');
    if (classification) classification.disabled = r.payload.decision !== 'ACCEPTED';
    const outcome = card.querySelector('[data-finding-outcome]');
    const status = !r.payload.decision
      ? 'Decision required.'
      : r.payload.decision === 'REJECTED'
        ? 'Rejected — no obligation.'
        : r.createsObligation
          ? 'Accepted — will create a DRAFT obligation (requires independent approval).'
          : r.payload.classification
            ? 'Accepted — recorded as a finding, not an obligation.'
            : 'Accepted — select a classification.';
    if (outcome) outcome.textContent = r.missing.length ? `${status} Missing: ${r.missing.join(', ')}.` : status;
    if (!r.missing.length) complete += 1;
    if (!r.missing.length && r.createsObligation) drafts += 1;
  }
  const progress = panel.querySelector('[data-finding-review-progress]');
  if (progress) progress.textContent = `${complete} of ${cards.length} findings decided · ${drafts} DRAFT obligation(s) will be created.`;
  const submit = panel.querySelector('[data-finding-review-submit]');
  if (submit) {
    submit.disabled = complete !== cards.length;
    findingReviewDrafts.set(panel.getAttribute('data-connected-ai-finding-review'), saved);
  }
}

export function collectFindingReviewPayload(panel) {
  const uat = panel.getAttribute('data-evidence-pathway') === 'human_verified_uat';
  const cards = [...panel.querySelectorAll('[data-finding-review-item]')].map((c) => readFindingCard(c, uat));
  if (cards.some((c) => c.missing.length)) return null;
  return {
    decisions: cards.map((c) => c.payload),
    notes: panel.querySelector('[data-finding-review-notes]')?.value.trim() || undefined,
  };
}

/** Wires inputs and the submit button; `onSubmitted` receives the API result. */
export function bindConnectedAiFindingReview(panel, { onSubmitted, onError } = {}) {
  if (!panel) return;
  panel.querySelectorAll('[data-finding-use-suggestion]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-finding-review-item]');
      const text = card?.querySelector('[data-finding-suggested-quotation]')?.textContent || '';
      const target = card?.querySelector('[data-finding-quotation]');
      if (target && !target.disabled) target.value = text;
      syncFindingReviewPanel(panel);
    }),
  );
  panel.addEventListener('input', () => syncFindingReviewPanel(panel));
  panel.addEventListener('change', () => syncFindingReviewPanel(panel));
  syncFindingReviewPanel(panel);
  const submit = panel.querySelector('[data-finding-review-submit]');
  submit?.addEventListener('click', async () => {
    const payload = collectFindingReviewPayload(panel);
    if (!payload) return;
    submit.disabled = true;
    try {
      const runId = panel.getAttribute('data-connected-ai-finding-review');
      const result = await submitConnectedAiFindingReview(getState(), runId, payload);
      findingReviewDrafts.delete(runId);
      onSubmitted?.(result);
    } catch (e) {
      onError?.(e);
      syncFindingReviewPanel(panel);
    }
  });
}
