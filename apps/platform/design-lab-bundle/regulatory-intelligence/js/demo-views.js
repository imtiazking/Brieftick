import { DEMO_JOURNEYS } from './demo-journey.js';
import { esc, pageHeader, intelligenceLabel } from './components.js';
export function viewDemo(queryJourney) {
  const journeys = Object.values(DEMO_JOURNEYS);
  const cards = journeys
    .map(
      (j) => `
    <article class="ri-panel ri-demo-card" id="demo-${esc(j.id)}">
      ${intelligenceLabel('DEMO JOURNEY')}
      <h2 class="ri-demo-card__title">${esc(j.title)}</h2>
      <p class="ri-demo-card__sub">${esc(j.subtitle)}</p>
      <p class="ri-demo-flow"><strong>Journey:</strong> ${esc(j.flow)}</p>
      <div class="ri-form__actions">
        <button type="button" class="ri-btn ri-btn--primary" data-start-demo="${esc(j.id)}">Start demo</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-start-guided="${esc(j.id)}">Start with step guidance</button>
      </div>
      <ol class="ri-demo-steps">
        ${j.steps.map((s) => `<li><a href="${esc(s.href)}">${esc(s.label)}</a><span class="ri-muted"> — ${esc(s.detail)}</span></li>`).join('')}
      </ol>
    </article>`
    )
    .join('');

  const focus = queryJourney && DEMO_JOURNEYS[queryJourney] ? `<p class="ri-alert">Selected: <strong>${esc(DEMO_JOURNEYS[queryJourney].title)}</strong> — use Start demo below.</p>` : '';

  return `${pageHeader({
    eyebrow: 'PRODUCT DEMONSTRATIONS',
    title: 'Demo journeys',
    subtitle: 'Presentation-ready paths through mock regulatory change data. All source text is DEMO / MOCK REGULATORY TEXT.',
  })}
    ${focus}
    <p class="ri-muted ri-demo-purpose"><strong>Dashboard</strong> = management overview · <strong>Work Queue</strong> = assigned work · <strong>Attention Centre</strong> = alerts and exceptions.</p>
    <div class="ri-split">${cards}</div>
    <p class="ri-muted"><a href="#/admin">Administration</a> — switch demo persona or reset the demo environment.</p>`;
}

export function renderWalkthroughBar(active) {
  if (!active) return '';
  const { index, total, step, journey } = active;
  return `
    <aside class="ri-demo-guide" role="complementary" aria-label="Demo guidance">
      <div class="ri-demo-guide__head">
        <span class="ri-demo-guide__step">Step ${index + 1} of ${total}</span>
        <span class="ri-demo-guide__journey">${esc(journey.title)}</span>
        <button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-walkthrough-dismiss aria-label="Dismiss guidance">Dismiss</button>
      </div>
      <h3 class="ri-demo-guide__title">${esc(step.title)}</h3>
      <p class="ri-demo-guide__body">${esc(step.body)}</p>
      <div class="ri-form__actions">
        <a class="ri-btn ri-btn--primary" href="${esc(step.next)}">Continue</a>
        <button type="button" class="ri-btn ri-btn--ghost" data-walkthrough-next>Next step</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-walkthrough-end>End guidance</button>
      </div>
      <p class="ri-muted"><a href="#/demo">Return to Demo Journeys</a></p>
    </aside>`;
}

export function nextActionsPanel(title, items) {
  if (!items?.length) return '';
  return `
    <section class="ri-next-actions" aria-label="Suggested next actions">
      <h2 class="ri-next-actions__title">${esc(title)}</h2>
      <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
    </section>`;
}
