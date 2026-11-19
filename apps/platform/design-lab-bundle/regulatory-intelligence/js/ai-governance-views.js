import { getState, personName } from './store.js';
import {
  esc,
  badge,
  pageHeader,
  dataTable,
  formatDate,
  formatDateTime,
  linkRecord,
  notFoundState,
  renderCitation,
} from './components.js';
import {
  getCurrentAnalysis,
  getClaimsForAnalysis,
  getReviewForAnalysis,
  getHumanReviewStatus,
  getAIReviewRequirement,
  getAnalysis,
  getEngine,
  getModel,
  getPromptConfig,
  getUseCase,
  getAnalysesForEntity,
  getAIOversightMetrics,
  getAnalysesRequiringReanalysis,
  getOrgFactor,
  getConfidenceBand,
  sectionCitationLink,
} from './ai-governance-helpers.js';

export function viewAiGovernanceRegister() {
  const s = getState();
  const m = getAIOversightMetrics(s);
  const useCases = (s.aiUseCases || []).map(
    (u) => `<tr>
      <td><a href="#/ai-use-case/${esc(u.id)}">${esc(u.name)}</a></td>
      <td>${esc(personName(s, u.ownerId))}</td>
      <td>${badge(u.riskClassification)}</td>
      <td>${esc(getModel(s, s.aiEngines?.[0]?.currentModelId)?.name || '—')}</td>
      <td>${u.humanOversightRequired ? 'Yes' : 'No'}</td>
      <td>${badge(u.status)}</td>
    </tr>`
  );
  const pending = (s.aiAnalyses || []).filter((a) => getHumanReviewStatus(s, a) === 'Review Required');
  const opsLink = '<p><a href="#/ai-operations">AI Operations (execution monitor)</a> — technical runs separate from governance outcomes.</p>';
  const rows = pending.slice(0, 12).map(
    (a) => `<tr><td><a href="#/ai-analysis/${esc(a.id)}">${esc(a.id)}</a></td>
    <td>${esc(a.analysisType)}</td><td>${esc(a.entityType)} ${esc(a.entityId)}</td>
    <td>${a.confidence}%</td><td>${badge(a.groundingStatus)}</td></tr>`
  );
  const models = (s.aiModels || []).map(
    (mod) => `<li><a href="#/ai-model/${esc(mod.id)}">${esc(mod.name)}</a> — ${badge(mod.status)}</li>`
  );
  return `${pageHeader('AI Governance', 'Use cases, analysis health, human oversight and model configuration (MOCK)')}
    <p class="ri-muted">Compliance-oriented register — not an ML engineering console.</p>
    ${opsLink}
    <section class="ri-panel"><h2>AI use cases</h2>${dataTable(['Use case', 'Owner', 'Risk', 'Active model', 'Human oversight', 'Status'], useCases)}</section>
    <section class="ri-panel"><h2>Analysis health</h2>
      <ul><li>Analyses: <strong>${m.analysesGenerated}</strong></li>
      <li>Low confidence: <strong>${m.lowConfidenceRate}%</strong></li>
      <li>Unsupported claims: <strong>${m.unsupportedClaimCount}</strong></li>
      <li>Source conflicts: <strong>${m.sourceConflictCount}</strong></li>
      <li>Re-analysis required: <strong>${m.reanalysisCount}</strong></li></ul>
    </section>
    <section class="ri-panel"><h2>Human oversight — awaiting review</h2>${dataTable(['Analysis', 'Type', 'Entity', 'Confidence', 'Grounding'], rows, 'No pending AI reviews')}</section>
    <section class="ri-panel"><h2>Models</h2><ul>${models.join('')}</ul></section>
    <p><a href="#/reports/ai-oversight">AI Oversight report</a> · <a href="#/admin/organisation">Organisation profile versions</a></p>`;
}

export function viewAiAnalysis(id) {
  const s = getState();
  const a = getAnalysis(s, id);
  if (!a) return notFoundState('AI Analysis', id);
  const claims = getClaimsForAnalysis(s, id);
  const review = getReviewForAnalysis(s, id);
  const req = getAIReviewRequirement(s, a);
  const prior = a.supersedesAnalysisId ? getAnalysis(s, a.supersedesAnalysisId) : null;
  const next = a.supersededByAnalysisId ? getAnalysis(s, a.supersededByAnalysisId) : null;
  const entityHref =
    a.entityType === 'Regulatory Change'
      ? `#/change/${a.entityId}`
      : a.entityType === 'Publication'
        ? `#/publication/${a.entityId}`
        : a.entityType === 'Change Candidate'
          ? `#/ingestion/candidate/${a.entityId}`
          : '#';

  const claimRows = claims.map((c) => {
    const cites = (c.sourceSectionIds || [])
      .map((sid) => {
        const link = sectionCitationLink(s, sid);
        return link ? renderCitation(link.pubId, link.label, link.slug) : esc(sid);
      })
      .join(', ');
    return `<tr data-claim-row="${esc(c.id)}">
        <td>${badge(c.claimType)}</td>
        <td>${esc(c.text)}</td>
        <td>${c.confidence}%</td>
        <td>${badge(c.groundingStatus)}</td>
        <td>${badge(c.citationStatus)}</td>
        <td>${cites || '<span class="ri-muted">—</span>'}</td>
      </tr>`;
  });

  const factors = (a.explainability?.reasoningFactors || [])
    .map((f) => {
      const of = getOrgFactor(s, f);
      return of ? `${esc(of.label)} <span class="ri-mono">(${esc(of.id)})</span>` : esc(f);
    })
    .join('<br/>');

  const compare =
    prior && next
      ? `<section class="ri-panel"><h2>Version comparison</h2>
      <p>V1: ${esc(prior.recommendations?.[0]?.value)} — ${prior.confidence}% · ${badge(prior.groundingStatus)}</p>
      <p>V2: ${esc(next.recommendations?.[0]?.value)} — ${next.confidence}% · ${badge(next.groundingStatus)}</p>
      <p class="ri-muted">Human decision on entity is preserved separately from AI version history.</p></section>`
      : prior
        ? `<p><a href="#/ai-analysis/${esc(prior.id)}">Previous analysis ${esc(prior.id)}</a></p>`
        : next
          ? `<p><a href="#/ai-analysis/${esc(next.id)}">Superseding analysis ${esc(next.id)}</a></p>`
          : '';

  return `${pageHeader('AI Analysis', id)}
    <p><a href="${entityHref}">← ${esc(a.entityType)} ${esc(a.entityId)}</a> · <a href="#/ai-governance">AI Governance</a></p>
    <section class="ri-panel"><h2>Analysis metadata</h2>
      <dl class="ri-dl ri-dl--wide">
        <dt>Type</dt><dd>${esc(a.analysisType)}</dd>
        <dt>Generated</dt><dd>${formatDateTime(a.generatedAt)}</dd>
        <dt>Engine</dt><dd>${esc(getEngine(s, a.analysisEngineId)?.name || a.analysisEngineId)}</dd>
        <dt>Model</dt><dd><a href="#/ai-model/${esc(a.modelId)}">${esc(getModel(s, a.modelId)?.name || a.modelId)}</a></dd>
        <dt>Configuration</dt><dd><a href="#/ai-config/${esc(a.promptConfigId)}">${esc(a.promptConfigId)}</a> (${esc(getPromptConfig(s, a.promptConfigId)?.version || '')})</dd>
        <dt>Organisation profile</dt><dd>${esc(a.organisationProfileVersion)}</dd>
        <dt>Source document version</dt><dd>${esc(a.metadata?.sourceDocumentVersion || '—')}</dd>
      </dl>
    </section>
    <section class="ri-panel"><h2>Recommendation</h2>
      <p><strong>${esc(a.recommendations?.[0]?.value || '—')}</strong> · AI confidence: <strong>${a.confidence}%</strong> (${getConfidenceBand(a.confidence)})</p>
      <p>Grounding: ${badge(a.groundingStatus)} · Quality gate: ${badge(a.qualityGate?.result || '—')}</p>
      ${a.reanalysisStatus ? `<p class="ri-alert">Model / source status: <strong>${esc(a.reanalysisStatus)}</strong>${a.reanalysisReason ? ` — ${esc(a.reanalysisReason)}` : ''}</p>` : ''}
      ${a.qualityGate?.result === 'Fail' ? `<div class="ri-alert">AI Analysis Quality Gate Failed<ul>${(a.qualityGate.checks || []).filter((c) => !c.pass).map((c) => `<li>${esc(c.label)}: ${esc(c.detail)}</li>`).join('')}</ul></div>` : ''}
      ${req.required ? `<div class="ri-alert">Mandatory human review: ${req.reasons.map((r) => esc(r)).join('; ')}</div>` : ''}
    </section>
    <section class="ri-panel"><h2>Claims &amp; supporting evidence</h2>
      ${dataTable(['Type', 'Claim', 'Confidence', 'Grounding', 'Citation', 'Source'], claimRows, 'No claims')}
    </section>
    <section class="ri-panel"><h2>Explainability</h2>
      <p>${esc(a.explainability?.recommendation || '')}</p>
      <h3>Reasoning factors</h3><p>${factors || '—'}</p>
      <h3>Limitations</h3><ul>${(a.explainability?.limitations || []).map((l) => `<li>${esc(l)}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    </section>
    <section class="ri-panel"><h2>Human review</h2>
      <p>Status: ${badge(getHumanReviewStatus(s, a))}</p>
      ${review ? `<p>Reviewer: ${esc(personName(s, review.reviewerId))} · Decision: ${badge(review.decision)}</p><p>${esc(review.justification)}</p>` : '<p class="ri-muted">No review recorded on this analysis.</p>'}
      ${a.groundingStatus === 'Source Conflict' && !a.conflictResolution ? `<button type="button" class="ri-btn ri-btn--primary" data-resolve-conflict="${esc(id)}">Record human interpretation (conflict)</button>` : ''}
      ${a.reanalysisStatus === 'Re-analysis Recommended' ? `<button type="button" class="ri-btn ri-btn--ghost" data-run-reanalysis="${esc(a.supersedesAnalysisId || id)}">Run mock re-analysis</button>` : ''}
    </section>
    ${compare}
    <section class="ri-panel"><h2>Governance</h2>
      <p>Policy: ${esc(a.aiGovernancePolicyId)} · Use case: <a href="#/ai-use-case/${esc(a.useCaseId)}">${esc(a.useCaseId)}</a></p>
      <p class="ri-muted">Enterprise governance approval is separate from AI human review.</p>
    </section>`;
}

export function viewAiModel(id) {
  const s = getState();
  const m = getModel(s, id);
  if (!m) return notFoundState('AI Model', id);
  const impacted = (s.aiAnalyses || []).filter((a) => a.modelId === id);
  return `${pageHeader(m.name, id)}
    <p class="ri-muted">Mock model metadata — no external provider is called.</p>
    <dl class="ri-dl">
      <dt>Status</dt><dd>${badge(m.status)}</dd>
      <dt>Version</dt><dd>${esc(m.version)}</dd>
      <dt>Risk rating</dt><dd>${badge(m.riskRating)}</dd>
      <dt>Effective</dt><dd>${formatDate(m.effectiveFrom || m.releaseDate)}</dd>
      <dt>Replaced model</dt><dd>${m.replacedModelId ? `<a href="#/ai-model/${esc(m.replacedModelId)}">${esc(m.replacedModelId)}</a>` : '—'}</dd>
      <dt>Change summary</dt><dd>${esc(m.changeSummary || '—')}</dd>
    </dl>
    <h3>Approved use cases</h3><ul>${(m.approvedUseCases || []).map((u) => `<li><a href="#/ai-use-case/${esc(u)}">${esc(u)}</a></li>`).join('')}</ul>
    <h3>Analyses using this model</h3><ul>${impacted.map((a) => `<li><a href="#/ai-analysis/${esc(a.id)}">${esc(a.id)}</a></li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    <p><a href="#/ai-governance">← AI Governance</a></p>`;
}

export function viewAiUseCase(id) {
  const s = getState();
  const u = getUseCase(s, id);
  if (!u) return notFoundState('AI Use Case', id);
  const pol = s.aiGovernancePolicies?.find((p) => p.id === u.policyId);
  return `${pageHeader(u.name, id)}
    <p>${esc(u.description)}</p>
    <dl class="ri-dl">
      <dt>Owner</dt><dd>${esc(personName(s, u.ownerId))}</dt>
      <dt>Risk classification</dt><dd>${badge(u.riskClassification)}</dt>
      <dt>Human oversight</dt><dd>${u.humanOversightRequired ? 'Required' : 'Optional'}</dd>
      <dt>Source grounding</dt><dd>${u.sourceGroundingRequired ? 'Required' : 'Optional'}</dd>
      <dt>Policy</dt><dd>${esc(pol?.name || u.policyId)}</dd>
    </dl>
    <h3>Approved models</h3><ul>${(u.approvedModelIds || []).map((mid) => `<li><a href="#/ai-model/${esc(mid)}">${esc(mid)}</a></li>`).join('')}</ul>
    <p><a href="#/ai-governance">← AI Governance</a></p>`;
}

export function viewAiConfig(id) {
  const s = getState();
  const c = getPromptConfig(s, id);
  if (!c) return notFoundState('AI configuration', id);
  return `${pageHeader(c.name, `Configuration ${c.version}`)}
    <p class="ri-muted">Provenance metadata only — internal prompt text is not exposed.</p>
    <dl class="ri-dl">
      <dt>ID</dt><dd>${esc(c.id)}</dd>
      <dt>Purpose</dt><dd>${esc(c.purpose)}</dd>
      <dt>Analysis type</dt><dd>${esc(c.analysisType)}</dd>
      <dt>Status</dt><dd>${badge(c.status)}</dd>
      <dt>Citation required</dt><dd>${c.citationRequired ? 'Yes' : 'No'}</dd>
      <dt>Organisation profile required</dt><dd>${c.organisationProfileRequired ? 'Yes' : 'No'}</dd>
      <dt>Effective from</dt><dd>${formatDate(c.effectiveFrom)}</dd>
      <dt>Previous version</dt><dd>${c.previousVersionId ? `<a href="#/ai-config/${esc(c.previousVersionId)}">${esc(c.previousVersionId)}</a>` : '—'}</dd>
      <dt>Change summary</dt><dd>${esc(c.changeSummary || '—')}</dd>
    </dl>
    <p><a href="#/ai-governance">← AI Governance</a></p>`;
}

export function viewAiOversightReport() {
  const s = getState();
  const m = getAIOversightMetrics(s);
  const confRows = ['High', 'Medium', 'Low'].map((band) => {
    const analyses = (s.aiAnalyses || []).filter((a) => getConfidenceBand(a.confidence) === band);
    const reviews = analyses.map((a) => getReviewForAnalysis(s, a.id)?.decision).filter(Boolean);
    return `<tr><td>${band}</td><td>${analyses.length}</td><td>${reviews.filter((d) => d === 'Accepted').length}</td><td>${reviews.filter((d) => d === 'Modified').length}</td><td>${reviews.filter((d) => d === 'Rejected').length}</td></tr>`;
  });
  return `${pageHeader('AI Oversight', 'Human review, grounding and override metrics (demo sample)')}
    <p class="ri-muted">Demo sample — not statistically calibrated.</p>
    <ul>
      <li>Analyses generated: <strong>${m.analysesGenerated}</strong></li>
      <li>Human review rate: <strong>${m.humanReviewRate}%</strong></li>
      <li>Acceptance: <strong>${m.acceptanceRate}%</strong> · Modification: <strong>${m.modificationRate}%</strong> · Rejection: <strong>${m.rejectionRate}%</strong></li>
      <li>Low-confidence rate: <strong>${m.lowConfidenceRate}%</strong></li>
      <li>Unsupported claims: <strong>${m.unsupportedClaimCount}</strong></li>
      <li>Citation coverage: <strong>${m.citationCoverage}%</strong></li>
      <li>High-materiality human review coverage: <strong>${m.humanReviewCoverage.pct}%</strong> (${m.humanReviewCoverage.reviewed}/${m.humanReviewCoverage.total})</li>
    </ul>
    <h3>Grounding assurance</h3><ul>${Object.entries(m.groundingBreakdown).map(([k, v]) => `<li>${esc(k)}: <strong>${v}</strong></li>`).join('')}</ul>
    <h3>Confidence vs human outcome (demo)</h3>
    ${dataTable(['Band', 'Analyses', 'Accepted', 'Modified', 'Rejected'], confRows)}
    <h3>Overrides by analysis type</h3>
    <ul>${Object.entries(m.overrideByType).map(([t, o]) => `<li>${esc(t)}: accepted ${o.accepted}, modified ${o.modified}, rejected ${o.rejected}</li>`).join('') || '<li class="ri-muted">None</li>'}</ul>
    <p><a href="#/reports">← Reports</a></p>`;
}

export function renderChangeAiSummary(changeId) {
  const s = getState();
  const ch = s.changes.find((c) => c.id === changeId);
  const a = getCurrentAnalysis(s, 'Regulatory Change', changeId);
  if (!ch || !a) return '';
  const review = getReviewForAnalysis(s, a.id);
  const gov = ch.applicabilityDecision || 'Pending';
  return `<section class="ri-panel ri-ai-summary" data-ai-summary>
    <h2>AI governance</h2>
    <dl class="ri-dl ri-dl--compact">
      <dt>AI recommendation</dt><dd>${badge(a.recommendations?.[0]?.value || ch.applicabilityRecommendation)} · ${a.confidence ?? ch.applicabilityConfidence}%</dd>
      <dt>Grounding</dt><dd>${badge(a.groundingStatus)}</dd>
      <dt>Human decision</dt><dd>${badge(ch.applicabilityDecision || 'Pending')}${review ? ` (${badge(review.decision)})` : ''}</dd>
      <dt>Governance approval</dt><dd>${badge(ch.governanceStatus || 'See governance panel')}</dd>
    </dl>
    <p><a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/ai-analysis/${esc(a.id)}">View full AI analysis</a></p>
  </section>`;
}

export function renderDashboardAiSummary() {
  const s = getState();
  const m = getAIOversightMetrics(s);
  const pending = (s.aiAnalyses || []).filter((a) => getHumanReviewStatus(s, a) === 'Review Required').length;
  return `<section class="ri-panel ri-panel--compact"><h2>AI governance</h2>
    <p class="ri-muted">Reviews outstanding: ${pending} · Grounding issues: ${m.unsupportedClaimCount + m.sourceConflictCount} · Re-analysis: ${m.reanalysisCount}</p>
    <p><a href="#/ai-governance">AI Governance register</a></p></section>`;
}
