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
  finding_classification_code_required: 'select a regulatory classification code',
  finding_classification_unknown: 'the classification is unknown or not in the active policy, so it is routed to Exception Triage',
  finding_conversion_not_permitted: 'this classification is not conversion-eligible under the active policy',
  finding_source_not_binding: 'the publication is non-binding (e.g. finalised guidance), so a binding code cannot be converted',
  finding_classification_conflict: `the code contradicts the model’s classification — record evidence-based reclassification of at least 20 characters`,
  finding_binding_link_required: 'an evidential provision must be linked to the binding provision it supports',
  finding_binding_link_invalid: 'the linked binding provision is not a binding obligation in this organisation or review',
  finding_disposition_invalid: 'select a valid disposition',
  finding_disposition_not_allowed: 'this disposition is not available in the finding’s triage queue',
  finding_linked_obligation_required: 'enter the existing obligation to link to',
  finding_linked_obligation_unclassified: 'link only to a classified binding or evidential obligation verified against the authoritative provision',
  finding_quotation_required: 'an exact quotation is required',
  finding_provision_function_required: 'state the provision function (operative requirement, evidential provision, application, permission, exemption, transitional or definition)',
  finding_provision_function_invalid: 'the provision function is not recognised',
  finding_provision_reference_required: 'enter the provision reference (e.g. CONC 4.8.2R); its marker must match the classification code',
  finding_provision_outside_instrument: 'the quotation page is not a legal-instrument section of this publication (or is a transitional-provisions table), so it cannot ground an obligation',
  finding_provision_not_in_cited_section: 'the provision is not set out on the selected page — a cross-reference to a provision set out elsewhere cannot be converted',
  finding_provision_not_operative: 'application, permission, exemption, transitional and definition provisions — and quotations without duty language — cannot become standalone obligations',
};

const FINDING_REVIEW_MESSAGES = {
  segregation_of_duties: 'You requested this AI run, so a different reviewer must review it.',
  already_reviewed: 'This run has already been reviewed.',
  uc_ri_005_finding_review_disabled: 'Per-finding review is not enabled on this environment.',
  classification_policy_unavailable: 'No active regulatory classification policy applies to this publication, so findings cannot be converted.',
  obligation_classification_required: 'The database refused an obligation without a regulatory classification.',
  obligation_source_not_binding: 'The database refused an obligation from a non-binding publication.',
  obligation_binding_link_required: 'The database refused an evidential provision without a binding link.',
  obligation_provision_unverified: 'The database refused an obligation without a verified operative instrument provision.',
};

function formatFindingReviewError(code) {
  const text = String(code || 'finding_review_failed');
  const [key, finding] = text.split(':');
  if (FINDING_REVIEW_ERRORS[key]) return `Finding ${finding}: ${FINDING_REVIEW_ERRORS[key]}.`;
  if (FINDING_REVIEW_MESSAGES[key]) return FINDING_REVIEW_MESSAGES[key];
  if (key === 'obligation_conversion_not_permitted') return `The database refused conversion of classification ${finding || ''} under the active policy.`;
  return text;
}

const TRIAGE_QUEUE_LABELS = {
  OBLIGATION_TRIAGE: 'Obligation Triage',
  NON_OBLIGATION_TRIAGE: 'Non-Obligation Triage',
  EXCEPTION_TRIAGE: 'Exception Triage',
};

const DISPOSITION_LABELS = {
  CONVERT_TO_DRAFT_OBLIGATION: 'Convert to DRAFT obligation',
  LINK_TO_EXISTING_OBLIGATION: 'Link to existing obligation',
  SUPPORTING_INFORMATION: 'Record as supporting information',
  HORIZON_SCANNING: 'Refer to horizon scanning',
  ARCHIVE: 'Archive',
  RECLASSIFICATION_REQUESTED: 'Request evidence-based reclassification',
};

/** Mirrors QUEUE_ACTIONS in regulatory-classification-policy.mjs; the server re-validates every disposition. */
const QUEUE_DISPOSITIONS = {
  OBLIGATION_TRIAGE: ['CONVERT_TO_DRAFT_OBLIGATION', 'LINK_TO_EXISTING_OBLIGATION'],
  NON_OBLIGATION_TRIAGE: ['LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION', 'HORIZON_SCANNING', 'ARCHIVE', 'RECLASSIFICATION_REQUESTED'],
  EXCEPTION_TRIAGE: ['RECLASSIFICATION_REQUESTED', 'LINK_TO_EXISTING_OBLIGATION', 'SUPPORTING_INFORMATION', 'ARCHIVE'],
};

const EXCEPTION_REASON_LABELS = {
  unknown_classification: 'unknown classification',
  policy_unavailable: 'no active classification policy',
  unverified_citation: 'citation not verified',
  missing_legal_basis: 'missing legal basis',
  insufficient_evidence: 'insufficient evidence',
  binding_code_from_non_binding_source: 'binding code on a non-binding publication',
  conflicting_classifications: 'conflicts with the model classification',
  missing_binding_link: 'evidential provision without a binding link',
  provision_function_required: 'provision function not stated',
  provision_reference_required: 'provision reference missing or marker does not match the code',
  provision_not_in_instrument: 'quotation not from a legal-instrument section',
  provision_not_set_out_in_section: 'provision not set out on the quotation page',
  provision_not_operative: 'provision is not operative',
};

/** Mirrors PROVISION_FUNCTIONS in provision-eligibility.mjs. */
const PROVISION_FUNCTION_LABELS = {
  OPERATIVE_REQUIREMENT: 'Operative requirement (duty on the firm)',
  EVIDENTIAL_PROVISION: 'Evidential provision',
  APPLICATION: 'Application / scope',
  PERMISSION: 'Permission',
  EXEMPTION: 'Exemption',
  TRANSITIONAL: 'Transitional provision',
  DEFINITION: 'Definition',
};
const NON_OPERATIVE_FUNCTIONS = new Set(['APPLICATION', 'PERMISSION', 'EXEMPTION', 'TRANSITIONAL', 'DEFINITION']);

function provisionFunctionOptions(selected) {
  return ['<option value="">Select provision function…</option>']
    .concat(
      Object.entries(PROVISION_FUNCTION_LABELS).map(
        ([v, label]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`,
      ),
    )
    .join('');
}

const queueLabel = (q) => TRIAGE_QUEUE_LABELS[q] || q || '—';
const reasonsText = (reasons) => (reasons || []).map((r) => EXCEPTION_REASON_LABELS[r] || r).join(', ');

function policyEntries(policy) {
  return Array.isArray(policy?.entries) ? policy.entries : [];
}

function codeOptions(policy, selected) {
  return [`<option value="">Select classification code…</option>`]
    .concat(
      policyEntries(policy).map(
        (e) =>
          `<option value="${esc(e.code)}" data-queue="${esc(e.destinationQueue)}" data-convertible="${e.conversionEnabled ? '1' : '0'}" data-link-required="${
            e.supportingObligationLinkRequired ? '1' : '0'
          }"${e.code === selected ? ' selected' : ''}>${esc(e.code)} — ${esc(e.description)} (${esc(e.legalStatus)})${
            e.conversionEnabled ? ' — conversion-eligible' : ''
          }</option>`,
      ),
    )
    .join('');
}

function dispositionOptions(queue, selected) {
  const allowed = QUEUE_DISPOSITIONS[queue] || [];
  return [`<option value="">${allowed.length ? 'Select disposition…' : 'Select a code first…'}</option>`]
    .concat(allowed.map((d) => `<option value="${esc(d)}"${d === selected ? ' selected' : ''}>${esc(DISPOSITION_LABELS[d])}</option>`))
    .join('');
}

function renderRecordedFindingDecisions(body) {
  const byIndex = new Map(body.findings.map((f) => [f.claimIndex, f]));
  const rows = body.decisions.map((d) => {
    const f = byIndex.get(d.claim_index);
    const notConverted = String(d.skip_reason || '').startsWith('not_converted:') ? d.skip_reason.slice('not_converted:'.length) : null;
    const outcome = d.obligation_id
      ? `DRAFT obligation <a href="#/obligation/${esc(d.obligation_id)}">${esc(d.obligation_id.slice(0, 8))}…</a>`
      : d.linked_obligation_id
        ? `Linked to obligation <a href="#/obligation/${esc(d.linked_obligation_id)}">${esc(d.linked_obligation_id.slice(0, 8))}…</a>`
        : notConverted
          ? `Not converted (${esc(DISPOSITION_LABELS[notConverted] || notConverted)})`
          : d.skip_reason
            ? `Not an obligation (${esc(d.skip_reason.replace('classification_not_obligation:', ''))})`
            : '—';
    const reasons = reasonsText(d.exception_reasons);
    return `<tr data-finding-decision-row="${esc(d.finding_id)}">
      <td>${esc(String(d.claim_index + 1))}</td>
      <td>${esc(f?.statement || '')}</td>
      <td>${badge(d.decision)}</td>
      <td>${esc(d.regulatory_classification_code || d.classification || '—')}${d.legal_status ? ` <span class="ri-muted">(${esc(d.legal_status)})</span>` : ''}${
        d.provision_reference || d.provision_function
          ? `<br><span class="ri-muted" data-finding-decision-provision>${esc(d.provision_reference || '—')} · ${esc(PROVISION_FUNCTION_LABELS[d.provision_function] || d.provision_function || '—')}</span>`
          : ''
      }</td>
      <td data-finding-decision-queue>${esc(queueLabel(d.triage_queue))}${reasons ? `<br><span class="ri-muted">${esc(reasons)}</span>` : ''}</td>
      <td>${d.quotation_page ? `p.${esc(String(d.quotation_page))}` : '—'}</td>
      <td>${outcome}</td>
      <td>${esc(d.reviewer_comment || '')}</td>
    </tr>`;
  });
  const policy = body.classificationPolicy;
  return `<section class="ri-panel" data-connected-ai-finding-review-recorded>
    <h3>Per-finding review decisions</h3>
    <p class="ri-muted">Evidence pathway: <strong>${esc(body.decisions[0]?.evidence_pathway || '—')}</strong>.${
      policy ? ` Classification policy: ${esc(policy.regulatorKey)} v${esc(String(policy.policyVersion))}.` : ''
    } DRAFT obligations require submission and independent approval by a reviewer who is neither the AI requester nor the acceptor.</p>
    <table class="ri-table"><thead><tr><th>#</th><th>Finding</th><th>Decision</th><th>Classification</th><th>Triage queue</th><th>Page</th><th>Outcome</th><th>Reviewer comment</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>
  </section>`;
}

function renderFindingCard(f, policy, canReview, draft = {}, convertibleFindings = []) {
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
      <dt>Provisions set out on cited instrument pages</dt><dd data-finding-instrument-provisions>${
        (f.sections || [])
          .filter((s) => s.inLegalInstrument)
          .map((s) => `p.${esc(String(s.pageNumber))}${s.transitionalProvisions ? ' (transitional table)' : ''}: ${esc((s.provisionsSetOut || []).join(', ') || 'none')}`)
          .join('; ') || '<span class="ri-muted">none — cited pages are outside the legal instrument, so no conversion is possible</span>'
      }</dd>
      <dt>Model suggestion</dt><dd>${esc(suggestion?.modelBindingNature || 'none')}${
        f.modelConfidence != null ? ` · confidence ${esc(String(f.modelConfidence))}%` : ''
      } <span class="ri-muted">— verify against the PDF; confidence never overrides the classification policy</span></dd>
      <dt>Triage queue</dt><dd data-finding-queue>${esc(queueLabel(f.triage?.queue))}${
        f.triage?.provisional ? ' <span class="ri-muted">(provisional until a code is selected)</span>' : ''
      }${f.triage?.exceptionReasons?.length ? `<br><span class="ri-muted" data-finding-exception-reasons>${esc(reasonsText(f.triage.exceptionReasons))}</span>` : ''}</dd>
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
    <label>Regulatory classification code
      <select data-finding-code${disabled}>${codeOptions(policy, draft.code)}</select>
    </label>
    <label>Provision function (required for conversion-eligible codes)
      <select data-finding-provision-function${disabled}>${provisionFunctionOptions(draft.provisionFunction)}</select>
    </label>
    <label>Provision reference (as set out in the instrument, e.g. CONC 4.8.2R)
      <input type="text" data-finding-provision-reference placeholder="e.g. CONC 4.8.2R" value="${esc(draft.provisionReference || '')}"${disabled}>
    </label>
    <label>Disposition
      <select data-finding-disposition${disabled}>${dispositionOptions(draft.queue, draft.disposition)}</select>
    </label>
    <label data-finding-link-field>Existing obligation ID (for linking)
      <input type="text" data-finding-linked-obligation placeholder="Obligation UUID" value="${esc(draft.linkedObligationId || '')}"${disabled}>
    </label>
    <fieldset data-finding-binding-link-field><legend>Binding provision this evidential provision supports</legend>
      <label>Finding converted in this review
        <select data-finding-supporting-finding${disabled}><option value="">—</option>${convertibleFindings
          .filter((o) => o.findingId !== f.findingId)
          .map((o) => `<option value="${esc(o.findingId)}"${o.findingId === draft.supportingFindingId ? ' selected' : ''}>Finding ${esc(String(o.number))}</option>`)
          .join('')}</select>
      </label>
      <label>or existing binding obligation ID
        <input type="text" data-finding-supporting-obligation placeholder="Obligation UUID" value="${esc(draft.supportingObligationId || '')}"${disabled}>
      </label>
    </fieldset>
    <label>Evidence-based reclassification (required when the code contradicts the model classification)
      <textarea data-finding-reclassification rows="2"${disabled}>${esc(draft.reclassificationEvidence || '')}</textarea>
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
    <p class="ri-muted">Decide every finding against the original PDF and classify it with the regulator’s classification policy. Only accepted findings with a conversion-eligible code (R, E, D, P, UK, EU, TS) on a binding source can become obligations, and only as DRAFT. Guidance, conduct, recommendations, consultation proposals, permissions, definitions, exemptions, safe harbours, good practice, explanatory and repealed material are triaged — linked, recorded as supporting information, referred to horizon scanning or archived — and never become standalone obligations. Unknown classifications go to Exception Triage.</p>
    ${
      body.classificationPolicy
        ? `<p class="ri-muted" data-finding-review-policy>Classification policy: <strong>${esc(body.classificationPolicy.regulatorKey)} v${esc(
            String(body.classificationPolicy.policyVersion),
          )}</strong> (effective ${esc(body.classificationPolicy.effectiveFrom)})${body.publicationType ? ` · publication type <strong>${esc(body.publicationType)}</strong>` : ''}.</p>`
        : '<p class="ri-callout" data-finding-review-policy-unavailable>No active classification policy applies to this publication. Findings cannot be converted until a policy is approved.</p>'
    }
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
      .map((f) => renderFindingCard(f, body.classificationPolicy, canReview, drafts?.cards?.[f.findingId], body.findings))
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
  const codeSelect = card.querySelector('[data-finding-code]');
  const option = codeSelect?.selectedOptions?.[0];
  const code = codeSelect?.value || '';
  const convertible = option?.dataset?.convertible === '1';
  const provisionFunction = card.querySelector('[data-finding-provision-function]')?.value || '';
  const provisionReference = (card.querySelector('[data-finding-provision-reference]')?.value || '').replace(/\s+/g, ' ').trim();
  const nonOperative = convertible && NON_OPERATIVE_FUNCTIONS.has(provisionFunction);
  const queue = code ? (nonOperative ? 'NON_OBLIGATION_TRIAGE' : option?.dataset?.queue || 'EXCEPTION_TRIAGE') : '';
  const linkRequired = option?.dataset?.linkRequired === '1';
  const disposition = decision === 'ACCEPTED' ? card.querySelector('[data-finding-disposition]')?.value || '' : '';
  const createsObligation = decision === 'ACCEPTED' && disposition === 'CONVERT_TO_DRAFT_OBLIGATION';
  const linking = decision === 'ACCEPTED' && disposition === 'LINK_TO_EXISTING_OBLIGATION';
  const linkedObligationId = card.querySelector('[data-finding-linked-obligation]')?.value.trim() || '';
  const supportingFindingId = card.querySelector('[data-finding-supporting-finding]')?.value || '';
  const supportingObligationId = card.querySelector('[data-finding-supporting-obligation]')?.value.trim() || '';
  const reclassificationEvidence = card.querySelector('[data-finding-reclassification]')?.value.trim() || '';
  const legalBasis = card.querySelector('[data-finding-legal-basis]')?.value.trim() || '';
  const quotation = card.querySelector('[data-finding-quotation]')?.value.trim() || '';
  const page = card.querySelector('[data-finding-page]')?.value || '';
  const comment = card.querySelector('[data-finding-comment]')?.value.trim() || '';
  const missing = [];
  if (!decision) missing.push('decision');
  if (decision === 'ACCEPTED' && !code) missing.push('classification code');
  if (decision === 'ACCEPTED' && convertible && !provisionFunction) missing.push('provision function');
  if (decision === 'ACCEPTED' && code && !disposition) missing.push('disposition');
  if (linking && !linkedObligationId) missing.push('existing obligation ID');
  if (createsObligation) {
    if (legalBasis.length < 3) missing.push('legal basis');
    if (!provisionReference) missing.push('provision reference');
    if (quotation.length < FINDING_MIN_QUOTATION) missing.push('exact quotation');
    if (!page) missing.push('PDF page');
    if (linkRequired && !supportingFindingId && !supportingObligationId) missing.push('binding provision link');
  }
  if (!comment) missing.push('comment');
  else if (createsObligation && uat && comment.length < FINDING_MIN_UAT_JUSTIFICATION) {
    missing.push(`justification (${FINDING_MIN_UAT_JUSTIFICATION}+ characters)`);
  }
  return {
    missing,
    createsObligation,
    linking,
    linkRequired,
    queue,
    payload: {
      findingId: card.getAttribute('data-finding-review-item'),
      claimTextSha256: card.getAttribute('data-claim-sha'),
      decision,
      regulatoryClassificationCode: code || null,
      disposition: disposition || null,
      linkedObligationId: linking ? linkedObligationId : null,
      supportingFindingId: createsObligation && linkRequired && supportingFindingId ? supportingFindingId : null,
      supportingObligationId: createsObligation && linkRequired && supportingObligationId ? supportingObligationId : null,
      reclassificationEvidence: decision === 'ACCEPTED' && reclassificationEvidence ? reclassificationEvidence : null,
      legalBasis: createsObligation ? legalBasis : null,
      quotation: createsObligation ? quotation : null,
      quotationPage: createsObligation ? Number(page) : null,
      provisionFunction: decision === 'ACCEPTED' && convertible && provisionFunction ? provisionFunction : null,
      provisionReference: decision === 'ACCEPTED' && convertible && provisionReference ? provisionReference : null,
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
    const accepted = card.querySelector('[data-finding-decision]:checked')?.value === 'ACCEPTED';
    const dispositionSelect = card.querySelector('[data-finding-disposition]');
    const queue = readFindingCard(card, uat).queue;
    if (dispositionSelect && dispositionSelect.getAttribute('data-queue') !== queue) {
      const current = dispositionSelect.value;
      const allowed = QUEUE_DISPOSITIONS[queue] || [];
      const fallback = allowed.includes(current) ? current : allowed.length === 1 ? allowed[0] : '';
      dispositionSelect.innerHTML = dispositionOptions(queue, fallback);
      dispositionSelect.setAttribute('data-queue', queue);
    }
    const r = readFindingCard(card, uat);
    saved.cards[r.payload.findingId] = {
      decision: r.payload.decision,
      code: r.payload.regulatoryClassificationCode || '',
      queue: r.queue,
      disposition: dispositionSelect?.value || '',
      linkedObligationId: card.querySelector('[data-finding-linked-obligation]')?.value || '',
      supportingFindingId: card.querySelector('[data-finding-supporting-finding]')?.value || '',
      supportingObligationId: card.querySelector('[data-finding-supporting-obligation]')?.value || '',
      reclassificationEvidence: card.querySelector('[data-finding-reclassification]')?.value || '',
      provisionFunction: card.querySelector('[data-finding-provision-function]')?.value || '',
      provisionReference: card.querySelector('[data-finding-provision-reference]')?.value || '',
      legalBasis: card.querySelector('[data-finding-legal-basis]')?.value || '',
      quotation: card.querySelector('[data-finding-quotation]')?.value || '',
      page: card.querySelector('[data-finding-page]')?.value || '',
      comment: card.querySelector('[data-finding-comment]')?.value || '',
    };
    const canEdit = !!panel.querySelector('[data-finding-review-submit]');
    const setDisabled = (selector, off) =>
      card.querySelectorAll(selector).forEach((el) => {
        el.disabled = !canEdit || off;
      });
    setDisabled('[data-finding-legal-basis], [data-finding-quotation], [data-finding-page]', !r.createsObligation);
    setDisabled('[data-finding-code], [data-finding-reclassification]', !accepted);
    const convertibleCode = card.querySelector('[data-finding-code]')?.selectedOptions?.[0]?.dataset?.convertible === '1';
    setDisabled('[data-finding-provision-function], [data-finding-provision-reference]', !(accepted && convertibleCode));
    setDisabled('[data-finding-disposition]', !accepted || !r.queue);
    setDisabled('[data-finding-linked-obligation]', !r.linking);
    setDisabled('[data-finding-supporting-finding], [data-finding-supporting-obligation]', !(r.createsObligation && r.linkRequired));
    const outcome = card.querySelector('[data-finding-outcome]');
    const status = !r.payload.decision
      ? 'Decision required.'
      : r.payload.decision === 'REJECTED'
        ? 'Rejected — no obligation (decision retained for audit).'
        : !r.payload.regulatoryClassificationCode
          ? 'Accepted — select a classification code.'
          : r.createsObligation
            ? `${queueLabel(r.queue)} — will create a DRAFT obligation (requires independent approval).`
            : r.payload.disposition
              ? `${queueLabel(r.queue)} — ${DISPOSITION_LABELS[r.payload.disposition]}; no standalone obligation.`
              : `${queueLabel(r.queue)} — select a disposition.`;
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
