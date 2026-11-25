import { esc } from '../components.js';

const STAGE_LABELS = {
  obligation: 'Stage 1 — Obligation',
  impact: 'Stage 2 — Impact',
  risk: 'Stage 3 — Risk',
  control: 'Stage 4 — Control',
  assurance: 'Stage 5 — Assurance',
  closed: 'Closed',
};

export function renderConnectedComplianceLifecyclePanel(obligationId, lifecycle) {
  if (!lifecycle) return '';
  const stage = lifecycle.currentStage || 'obligation';
  const items = [
    ['Obligation', lifecycle.obligationStatus, `#/obligation/${esc(obligationId)}`],
    ['Impact', lifecycle.impact?.status, lifecycle.links?.impactId ? `#/assessment/${esc(lifecycle.links.impactId)}` : null],
    ['Risk', lifecycle.risk?.status, lifecycle.links?.riskId ? `#/risk/${esc(lifecycle.links.riskId)}` : null],
    ['Control', lifecycle.control?.status, lifecycle.links?.controlId ? `#/control/${esc(lifecycle.links.controlId)}` : null],
    [
      'Assurance',
      lifecycle.assurance?.result || lifecycle.assurance?.metadata?.assuranceStatus,
      lifecycle.links?.assuranceReviewId ? `#/assurance/${esc(lifecycle.links.assuranceReviewId)}` : null,
    ],
  ];
  return `<section class="ri-panel" data-connected-compliance-lifecycle="${esc(obligationId)}">
    <h2>Five-stage compliance lifecycle</h2>
    <p class="ri-muted">Current: <strong>${esc(STAGE_LABELS[stage] || stage)}</strong>. AI recommends; authorised humans approve each stage.</p>
    <ol class="ri-lifecycle__list">
      ${items
        .map(([label, status, href]) => {
          const st = status ? ` · ${esc(String(status))}` : ' · pending';
          const link = href
            ? `<a class="ri-lifecycle__link" href="${href}">${esc(label)}${st}</a>`
            : `<span>${esc(label)}${st}</span>`;
          return `<li class="ri-lifecycle__item">${link}</li>`;
        })
        .join('')}
    </ol>
  </section>`;
}