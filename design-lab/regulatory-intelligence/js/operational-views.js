import {
  getState,
  scenarioFilter,
  getPublication,
  getDemoUser,
  buildWorkQueue,
  buildNotifications,
  pipelineCounts,
  personName,
} from './store.js';
import { orgFactorBullets, relatedForPublication } from './seed-operational.js';
import { isIntakeCandidate, slaStatus, slaBadgeClass, teamMemberIds } from './workflow-helpers.js';
import { governanceMetrics, getClosureReadiness } from './governance-helpers.js';
import { getAIOversightMetrics, getAnalysesRequiringReanalysis, getHumanReviewStatus } from './ai-governance-helpers.js';
import {
  esc,
  badge,
  pageHeader,
  attentionItem,
  sectionHeader,
  dataTable,
  aiRecommendation,
  aiProvenancePanel,
  formatDate,
  formatDateTime,
  linkRecord,
  entityHero,
  notFoundState,
} from './components.js';

export function viewIntakeList() {
  const s = getState();
  let pubs = scenarioFilter(s.publications).filter(isIntakeCandidate);
  pubs = pubs.sort((a, b) => (b.detectedAt || '').localeCompare(a.detectedAt || ''));

  const rows = pubs.map((p) => {
    const sla = slaStatus(p.triageSlaDue, p.triageStatus === 'Accepted' || p.intakeAccepted);
    const inWorkflow = p.intakeAccepted ? '<span class="ri-muted">In RI workflow</span>' : '';
    return `<tr data-intake-row data-regulator="${esc(p.regulator)}" data-topic="${esc(p.topic)}" data-status="${esc(p.triageStatus)}" data-priority="${esc(p.aiPriority || p.priority)}" data-reviewer="${esc(p.assignedReviewerId || '')}" data-type="${esc(p.publicationType)}" data-search="${esc(`${p.title} ${p.reference} ${p.topic}`)}">
      <td>${badge(p.regulator)}</td>
      <td class="ri-table__title"><a class="ri-table__title-link" href="#/intake/${p.id}">${esc(p.title)}</a><span class="ri-mono ri-table__ref">${esc(p.reference)}</span> ${inWorkflow}</td>
      <td class="ri-mono">${esc(p.reference)}</td>
      <td>${esc(p.publicationType)}</td>
      <td>${formatDate(p.publishedDate)}</td>
      <td>${p.detectedAt ? formatDateTime(p.detectedAt) : '—'}</td>
      <td>${esc(p.topic)}</td>
      <td>UK</td>
      <td>${p.aiRelevanceScore ?? '—'}%</td>
      <td>${badge(p.aiPriority || p.priority)}</td>
      <td>${esc(p.aiClassification || p.topic)}</td>
      <td>${(p.affectedTopics || []).slice(0, 2).join(', ') || esc((s.orgProfile?.businessLines || []).slice(0, 2).join(', '))}</td>
      <td>${badge(p.triageStatus)}</td>
      <td>${esc(personName(s, p.assignedReviewerId) || '—')}</td>
      <td><span class="ri-badge ri-badge--${slaBadgeClass(sla)}">${esc(sla)}</span> ${formatDate(p.triageSlaDue)}</td>
    </tr>`;
  });

  return `${pageHeader('Regulatory Intake', 'Incoming publications for triage and assignment — mock regulatory content')}
    <div class="ri-toolbar ri-toolbar--wrap">
      <label class="ri-search"><span class="sr-only">Search</span>
        <input type="search" id="intake-search" placeholder="Search title, reference, topic…" data-intake-filter="search" />
      </label>
      <select class="ri-select" data-intake-filter="regulator"><option value="">All regulators</option><option>FCA</option><option>PRA</option></select>
      <select class="ri-select" data-intake-filter="status"><option value="">All triage status</option>
        ${['New', 'AI Analysed', 'Review Required', 'Assigned', 'In Review', 'Accepted', 'Not Relevant', 'Escalated'].map((x) => `<option>${x}</option>`).join('')}
      </select>
      <select class="ri-select" data-intake-filter="priority"><option value="">All priority</option><option>High</option><option>Medium</option><option>Low</option></select>
      <select class="ri-select" data-intake-filter="type"><option value="">All types</option><option>Policy Statement</option><option>Consultation Paper</option><option>Supervisory Statement</option><option>Letter</option></select>
    </div>
    ${dataTable(
      ['Regulator', 'Title', 'Ref', 'Type', 'Published', 'Detected', 'Topic', 'Jurisdiction', 'AI relevance', 'AI priority', 'Classification', 'Business areas', 'Triage', 'Reviewer', 'SLA / due'],
      rows,
      'No intake items for this scenario'
    )}`;
}

export function viewIntakeDetail(pubId) {
  const p = getPublication(pubId);
  if (!p) return notFoundState('Publication', pubId);
  const s = getState();
  const analysis = s.publicationAnalysis?.[pubId];
  const related = (s.relatedPublications || []).filter((r) => r.fromId === pubId || r.toId === pubId);
  const orgFactors = orgFactorBullets(s.orgProfile || {});
  const otherPub = (id) => getPublication(id);

  const relRows = related.map((r) => {
    const targetId = r.fromId === pubId ? r.toId : r.fromId;
    const tp = otherPub(targetId);
    return `<tr>
      <td><a href="#/intake/${targetId}">${esc(targetId)}</a></td>
      <td>${tp ? esc(tp.title) : '—'}</td>
      <td>${tp ? badge(tp.regulator) : '—'}</td>
      <td>${esc(r.relationshipType)}</td>
      <td>${r.similarityScore}%</td>
      <td>${esc(r.reason)} <button type="button" class="ri-why-btn" data-rel-why="${esc(r.reason)}">Why?</button></td>
      <td>${formatDate(r.date)}</td>
    </tr>`;
  });

  return `${entityHero(p.id, p.title, [
      { label: 'Regulator', value: p.regulator, badge: true },
      { label: 'Reference', value: p.reference, mono: true },
      { label: 'Triage', value: p.triageStatus, badge: true },
      { label: 'AI relevance', value: p.aiRelevanceScore != null ? `${p.aiRelevanceScore}%` : '—', mono: true },
      { label: 'Priority', value: p.aiPriority || p.priority, badge: true },
      { label: 'Reviewer', value: personName(s, p.assignedReviewerId) || 'Unassigned' },
      { label: 'SLA due', value: formatDate(p.triageSlaDue) },
    ], [
      { label: 'Regulatory Intelligence', href: '#/dashboard' },
      { label: 'Intake', href: '#/intake' },
      { label: p.id },
    ])}
    ${p.intakeAccepted ? '<p class="ri-muted">Accepted into regulatory change workflow</p>' : ''}

    <section class="ri-subsection"><h2>Detection</h2>
      <dl class="ri-dl">
        <dt>Detected</dt><dd>${p.detectedAt ? formatDateTime(p.detectedAt) : '—'}</dd>
        <dt>Source</dt><dd>${esc(p.sourceLabel || 'Mock connector')}</dd>
        <dt>Regulator</dt><dd>${esc(p.regulator)}</dd>
        <dt>Reference</dt><dd>${esc(p.reference)}</dd>
        <dt>URL</dt><dd><a href="${esc(p.sourceUrl)}">Mock source document</a></dd>
        <dt>Type</dt><dd>${esc(p.publicationType)}</dd>
        <dt>Jurisdiction</dt><dd>${esc(p.jurisdiction || 'UK')}</dd>
      </dl>
    </section>

    <section class="ri-subsection"><h2>AI classification</h2>
      ${aiRecommendation({
        recommendation: p.applicabilityRecommendation,
        confidence: p.aiRelevanceScore ?? p.applicabilityConfidence,
        reasoning: analysis?.reasoning || p.aiSummary,
        citation: analysis?.citation,
        pubId: p.id,
        sectionSlug: analysis?.citationSection,
      })}
      <dl class="ri-dl">
        <dt>Topic / scenario</dt><dd>${esc(p.aiClassification || p.topic)} · ${esc(p.scenario)}</dd>
        <dt>Business lines</dt><dd>${(analysis?.whoAffected?.businessLines || s.orgProfile?.businessLines || []).join(', ')}</dd>
        <dt>Legal entities</dt><dd>${(analysis?.whoAffected?.entities || s.orgProfile?.legalEntities || []).join(', ')}</dd>
        <dt>Products</dt><dd>${(analysis?.whoAffected?.products || s.orgProfile?.products || []).slice(0, 4).join(', ')}</dd>
        <dt>Customer types</dt><dd>${(analysis?.whoAffected?.customerTypes || s.orgProfile?.customerTypes || []).join(', ')}</dd>
        <dt>Functions</dt><dd>${(analysis?.whoAffected?.functions || s.orgProfile?.functions || []).slice(0, 5).join(', ')}</dd>
        <dt>Priority recommendation</dt><dd>${badge(p.aiPriority || p.priority)}</dd>
      </dl>
      <div class="ri-ai-box__why" data-why-panel>
        <p class="ri-muted"><strong>Why is this publication considered high relevance? (DEMO)</strong></p>
        <ul>${orgFactors.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>
      ${aiProvenancePanel(analysis?.aiGovernance || { generatedAt: p.aiGeneratedAt, humanReviewStatus: p.aiHumanReviewStatus }, orgFactors)}
    </section>

    <section class="ri-subsection"><h2>Possible related publications</h2>
      <p class="ri-muted">AI-assisted duplicate / related-document detection (DEMO — not live FCA matching).</p>
      ${dataTable(['ID', 'Title', 'Regulator', 'Relationship', 'Similarity', 'Reason', 'Date'], relRows, 'No related publications in seed')}
    </section>

    <section class="ri-subsection" data-intake-pub="${esc(pubId)}"><h2>Triage decision</h2>
      <div class="ri-form__actions">
        <button type="button" class="ri-btn ri-btn--primary" data-triage="accept">Accept for assessment</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-triage="not-relevant">Mark not relevant</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-triage="escalate">Escalate</button>
        <button type="button" class="ri-btn ri-btn--ghost" data-triage="request-review">Request additional review</button>
      </div>
      <div class="ri-form ri-form--inline" style="margin-top:12px">
        <label>Assign reviewer
          <select id="intake-assignee" data-assign-select>
            ${(s.people || []).map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}
          </select>
        </label>
        <label>Due date <input type="date" id="intake-due" value="${esc(p.triageSlaDue || '')}" /></label>
        <button type="button" class="ri-btn ri-btn--sm ri-btn--primary" data-intake-assign>Assign reviewer</button>
      </div>
      <p><a class="ri-btn ri-btn--ghost" href="#/publication/${p.id}">Open publication record</a></p>
    </section>`;
}

export function viewWorkQueue() {
  const s = getState();
  const demo = getDemoUser();
  let items = buildWorkQueue(s, s.scenarioId);
  const demoTeam = demo?.teamId;
  const teammates = new Set(teamMemberIds(s, demoTeam));
  const rows = items.map((w) => {
    const onMyTeam = w.ownerId && teammates.has(w.ownerId);
    const isMyWork = w.ownerId === s.currentDemoUserId;
    const rowClass = w.slaStatus === 'Overdue' ? 'ri-row--danger' : w.slaStatus === 'Due Soon' ? 'ri-row--warn' : '';
    return `<tr class="${rowClass}" data-work-row data-owner="${esc(w.ownerId || '')}" data-team="${esc(w.assignedTeamId || '')}" data-status="${esc(w.status)}" data-priority="${esc(w.priority)}" data-entity="${esc(w.entityType)}" data-category="${esc(w.category || '')}" data-scenario="${esc(w.scenario)}" data-sla="${esc(w.slaStatus)}" data-view-my="${isMyWork ? '1' : '0'}" data-view-team="${onMyTeam ? '1' : '0'}">
    <td class="ri-table__title"><a class="ri-table__title-link" href="${workHref(w)}">${esc(w.title)}</a></td>
    <td>${esc(w.entityType)}</td>
    <td class="ri-mono"><a href="${workHref(w)}">${esc(w.id)}</a></td>
    <td>${esc(personName(s, w.ownerId))}</td>
    <td>${badge(w.priority)}</td>
    <td>${formatDate(w.dueDate)}</td>
    <td>${badge(w.status)}</td>
    <td>${w.daysRemaining != null ? (w.overdue ? `${Math.abs(w.daysRemaining)}d overdue` : `${w.daysRemaining}d`) : '—'}</td>
    <td>${esc(w.scenario)}</td>
    <td>${w.regulator ? badge(w.regulator) : '—'}</td>
  </tr>`;
  });

  return `${pageHeader('Work Queue', `Assigned regulatory work · Demo persona: ${esc(demo?.name)} (${esc(demo?.title)})`)}
    <p class="ri-muted">Operational tasks owned by people and teams — distinct from the <a href="#/dashboard">Dashboard</a> overview and <a href="#/notifications">Attention Centre</a> alerts.</p>
    <div class="ri-toolbar ri-toolbar--wrap">
      <select class="ri-select" id="work-view"><option value="all">All</option><option value="my">My work</option><option value="my-team">My team</option><option value="overdue">Overdue</option><option value="due-soon">Due this week</option><option value="approval">Awaiting approval</option><option value="governance">Governance (approvals &amp; reviews)</option><option value="assurance">Assurance</option><option value="findings">Findings</option><option value="validation">Validation</option><option value="attestations">Attestations</option><option value="exceptions">Exceptions</option></select>
      <select class="ri-select" data-work-filter="entity"><option value="">All entity types</option>
        ${['Publication', 'Regulatory Change', 'Impact Assessment', 'Obligation', 'Action', 'Evidence', 'Governance Approval', 'Attestation', 'Governance Exception', 'AI Analysis', 'Assurance Review', 'Assurance Finding', 'Finding Validation', 'Management Attestation', 'Board Pack Review'].map((e) => `<option>${e}</option>`).join('')}
      </select>
      <select class="ri-select" data-work-filter="priority"><option value="">All priority</option><option>High</option><option>Medium</option></select>
    </div>
    ${dataTable(['Item', 'Type', 'ID', 'Owner', 'Priority', 'Due', 'Status', 'SLA', 'Scenario', 'Regulator'], rows, 'No work items')}`;
}

function workHref(w) {
  const m = {
    Publication: `intake/${w.id}`,
    'Regulatory Change': `change/${w.id}`,
    'Impact Assessment': `assessment/${w.id}`,
    Obligation: `obligation/${w.id}`,
    Action: `action/${w.id}`,
    Evidence: `evidence/${w.id}`,
    'Governance Approval': `approval/${w.id}`,
    Attestation: `attestation/${w.id}`,
    'Governance Exception': `exception/${w.id}`,
    'AI Analysis': `ai-analysis/${w.id}`,
    'Assurance Review': `assurance/${w.id}`,
    'Assurance Finding': `finding/${w.id}`,
    'Finding Validation': `finding/${w.id}`,
    'Management Attestation': `management-attestation/${w.id}`,
    'Board Pack Review': `board-pack/${w.id}`,
  };
  return `#/${m[w.entityType] || 'dashboard'}`;
}

export function viewNotifications() {
  const s = getState();
  const notes = buildNotifications(s, s.scenarioId);
  const highlights = notes
    .filter((n) => !n.read && (n.severity === 'High' || n.severity === 'Critical'))
    .slice(0, 4)
    .map((n) =>
      attentionItem({
        severity: n.severity,
        title: n.message,
        context: `${n.type} · ${n.entityType} ${n.entityId}`,
        owner: personName(s, n.ownerId) || '—',
        age: formatDate(n.at),
        href: n.href,
        nextAction: `<a href="${esc(n.href)}">Open record</a>`,
      })
    )
    .join('');
  const rows = notes.map(
    (n) => `<tr class="ri-note-row${n.read ? ' is-read' : ''} ri-note-row--${esc(n.severity?.toLowerCase() || 'medium')}" data-note-id="${esc(n.id)}">
      <td>${badge(n.severity)}</td>
      <td>${esc(n.type)}</td>
      <td>${esc(n.entityType)} ${esc(n.entityId)}</td>
      <td>${formatDate(n.at)}</td>
      <td>${esc(n.message)}</td>
      <td><a href="${esc(n.href)}" data-note-link="${esc(n.id)}">Open</a></td>
      <td>${n.read ? 'Read' : `<button type="button" class="ri-btn ri-btn--sm ri-btn--ghost" data-mark-read="${esc(n.id)}">Mark read</button>`}</td>
    </tr>`
  );
  return `${pageHeader({
    eyebrow: 'ATTENTION CENTRE',
    title: 'Exceptions, escalations and deadlines',
    subtitle: 'Exception-driven notifications — not a general work list.',
    actions: `<a class="ri-btn ri-btn--ghost" href="#/work">Work queue</a>`,
  })}
    ${highlights ? `<div class="ri-attention-stack">${highlights}</div>` : ''}
    ${sectionHeader('ALL NOTIFICATIONS', 'Full register', '')}
    ${dataTable(['Severity', 'Type', 'Entity', 'Date', 'Message', 'Link', 'State'], rows, 'No notifications for this scenario')}`;
}

export function viewReportsExecutive() {
  const s = getState();
  const pipe = pipelineCounts(s, s.scenarioId);
  const pubs = scenarioFilter(s.publications);
  const highMat = scenarioFilter(s.changes).filter((c) => c.materiality === 'High' && c.status !== 'Complete');
  const overdueActs = scenarioFilter(s.actions).filter((a) => a.status === 'Overdue' || a.status !== 'Complete');
  const gov = governanceMetrics(s);
  const blockedClose = scenarioFilter(s.changes).filter((c) => c.materiality === 'High' && c.closureStatus !== 'Closed' && !getClosureReadiness(s, c.id).ready);
  return `${pageHeader('Executive Summary', 'Board and executive committee view — derived from live demo data (mock regulatory content)')}
    <p class="ri-muted">Answers: What regulatory changes matter? What is overdue? What needs executive attention? Where are evidence or implementation gaps?</p>
    <div class="ri-module-grid">
      <article class="ri-panel"><h3>Regulatory developments (period)</h3><p class="ri-module__value">${pubs.filter((p) => p.publishedDate >= '2026-07-01').length}</p><p class="ri-muted">Publications since Jul 2026 (scenario-filtered)</p></article>
      <article class="ri-panel"><h3>High-materiality changes</h3><p class="ri-module__value">${highMat.length}</p></article>
      <article class="ri-panel"><h3>Overdue actions</h3><p class="ri-module__value">${overdueActs.filter((a) => a.status === 'Overdue').length}</p></article>
      <article class="ri-panel"><h3>Pipeline — in triage</h3><p class="ri-module__value">${pipe.inTriage}</p></article>
    </div>
    <section class="ri-panel"><h3>Items awaiting executive decision</h3>
      <ul>${highMat.slice(0, 5).map((c) => `<li>${linkRecord('Regulatory Change', c.id, c.title)} — ${badge(c.status)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    </section>
    <section class="ri-panel"><h3>Governance attention (executive)</h3>
      <ul>
        <li>High-materiality changes awaiting governance approval: <strong>${gov.pending}</strong></li>
        <li>Overdue governance decisions: <strong>${gov.overdue}</strong></li>
        <li>Control test failures: <strong>${gov.failedTests}</strong></li>
        <li>Expiring / open exceptions: <strong>${gov.exceptions}</strong></li>
        <li>Outstanding attestations: <strong>${gov.attDue}</strong></li>
        <li>Changes blocked from closure: <strong>${blockedClose.length}</strong>${blockedClose[0] ? ` (e.g. ${esc(blockedClose[0].id)})` : ''}</li>
      </ul>
      <p><a href="#/governance">Governance register</a></p>
    </section>
    <section class="ri-panel"><h3>AI governance (executive)</h3>
      <ul>
        <li>High-sensitivity use cases: <strong>${(s.aiUseCases || []).filter((u) => u.riskClassification?.includes('High')).length}</strong></li>
        <li>AI reviews outstanding: <strong>${(s.aiAnalyses || []).filter((a) => getHumanReviewStatus(s, a) === 'Review Required').length}</strong></li>
        <li>Grounding issues: <strong>${getAIOversightMetrics(s).unsupportedClaimCount + getAIOversightMetrics(s).sourceConflictCount}</strong></li>
        <li>Re-analysis required: <strong>${getAnalysesRequiringReanalysis(s).length}</strong></li>
      </ul>
      <p><a href="#/ai-governance">AI Governance register</a></p>
    </section>
    <section class="ri-panel"><h3>Upcoming effective dates (90d)</h3>
      <ul>${pubs.filter((p) => p.effectiveDate && p.effectiveDate <= '2027-01-06').slice(0, 6).map((p) => `<li><a href="#/publication/${p.id}">${formatDate(p.effectiveDate)} — ${esc(p.title)}</a></li>`).join('')}</ul>
    </section>
    <p><a href="#/reports">← All reports</a></p>`;
}

export function viewReportsExtended(sub) {
  const s = getState();
  const pipe = pipelineCounts(s, s.scenarioId);
  if (sub === 'pipeline') {
    return `${pageHeader('Regulatory Change Pipeline', 'Volume and stage of regulatory changes in the selected demo scenario')}<ul class="ri-stats-inline">
      <li>New <strong>${pipe.new}</strong></li><li>In Triage <strong>${pipe.inTriage}</strong></li>
      <li>Applicability <strong>${pipe.applicability}</strong></li><li>Impact Assessment <strong>${pipe.impact}</strong></li>
      <li>Implementation <strong>${pipe.implementation}</strong></li><li>Complete <strong>${pipe.complete}</strong></li></ul>`;
  }
  if (sub === 'exposure') {
    const byReg = {};
    scenarioFilter(s.changes).forEach((c) => {
      const pub = getPublication(c.publicationId);
      const r = pub?.regulator || 'Other';
      byReg[r] = (byReg[r] || 0) + 1;
    });
    return `${pageHeader('Regulatory Exposure', 'Regulatory changes by regulator — indicates concentration of supervisory activity')}<ul>${Object.entries(byReg).map(([k, v]) => `<li>${esc(k)}: <strong>${v}</strong> changes</li>`).join('')}</ul>`;
  }
  if (sub === 'implementation') {
    const obls = scenarioFilter(s.obligations);
    const acts = scenarioFilter(s.actions);
    const done = acts.filter((a) => a.status === 'Complete').length;
    return `${pageHeader('Implementation Progress', 'Obligation coverage and action completion in the selected scenario')}
      <p>Obligations: <strong>${obls.length}</strong> · Actions complete: <strong>${done}</strong> / ${acts.length}</p>
      <p>Overdue actions: <strong>${acts.filter((a) => a.status === 'Overdue').length}</strong></p>`;
  }
  if (sub === 'dates') {
    return `${pageHeader('Upcoming Regulatory Dates', 'DEMO')}<p><a href="#/calendar">Open calendar</a></p>`;
  }
  if (sub === 'governance') {
    const m = governanceMetrics(s);
    const chains = s.approvalChains || [];
    const returned = chains.filter((c) => c.status === 'Returned for Changes').length;
    return `${pageHeader('Governance & assurance', 'Approval status, exceptions, attestations and evidence assurance (derived)')}
      <h3>Approval status</h3><ul>
        <li>Pending: <strong>${m.pending}</strong></li><li>Overdue steps: <strong>${m.overdue}</strong></li><li>Returned: <strong>${returned}</strong></li></ul>
      <h3>Attestation status</h3><ul><li>Due: <strong>${m.attDue}</strong></li></ul>
      <h3>Evidence assurance</h3><ul><li>Expired: <strong>${m.expiredEv}</strong></li></ul>
      <h3>Control effectiveness</h3><ul>${['Effective', 'Partially Effective', 'Ineffective', 'Not Tested'].map((st) => {
        const n = scenarioFilter(s.controls).filter((c) => (c.effectivenessStatus || 'Not Tested') === st).length;
        return `<li>${esc(st)}: <strong>${n}</strong></li>`;
      }).join('')}</ul>
      <h3>Regulatory change closure</h3><ul>${scenarioFilter(s.changes).map((c) => {
        const r = getClosureReadiness(s, c.id);
        const label = c.closureStatus === 'Closed' ? 'Closed' : r.ready ? 'Ready to close' : 'Blocked';
        return `<li>${esc(c.id)}: <strong>${label}</strong></li>`;
      }).join('')}</ul>`;
  }
  if (sub === 'ai-oversight') {
    const ch = scenarioFilter(s.changes);
    const overridden = ch.filter((c) => c.aiGovernance?.humanReviewStatus === 'Human modified' || c.decisionMeta?.justification).length;
    const avg = Math.round(ch.reduce((a, c) => a + (c.applicabilityConfidence || 0), 0) / (ch.length || 1));
    return `${pageHeader('AI Recommendation Oversight', 'Human-in-the-loop governance — AI recommends; humans decide and justify')}
      <ul><li>Human-modified decisions: <strong>${overridden}</strong></li>
      <li>Review required: <strong>${ch.filter((c) => c.applicabilityDecision === 'Review Required').length}</strong></li>
      <li>Average confidence: <strong>${avg}%</strong></li></ul>`;
  }
  return viewReportsExecutive();
}

export function viewAdminOrganisation() {
  const p = getState().orgProfile;
  if (!p) return `${pageHeader('Organisation profile', '')}<p class="ri-muted">No profile.</p>`;
  return `${pageHeader('Organisation profile', `${p.version} · DEMO profile for AI reasoning`)}
    <p><a href="#/admin">← Administration</a></p>
    <section class="ri-panel"><h3>Legal entities</h3><ul>${p.legalEntities.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Jurisdictions</h3><ul>${p.jurisdictions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Products</h3><ul>${p.products.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Customer types</h3><ul>${p.customerTypes.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Business lines</h3><ul>${p.businessLines.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Functions</h3><ul>${p.functions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Regulatory permissions</h3><ul>${p.permissions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
    <section class="ri-panel"><h3>Organisation profile versions (AI)</h3>
      <ul>${(getState().organisationProfileVersions || []).map((v) => `<li><strong>${esc(v.id)}</strong> — ${badge(v.status)} · ${esc(v.changeSummary)}</li>`).join('')}</ul>
      <p class="ri-muted">Profile changes may trigger re-analysis recommendations for open regulatory work.</p>
    </section>`;
}
