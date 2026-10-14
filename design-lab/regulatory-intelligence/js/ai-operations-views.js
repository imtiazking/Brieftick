import { getState } from './store.js';
import { esc, badge, pageHeader, dataTable, formatDateTime, entityHero, notFoundState } from './components.js';
import { getAnalysis } from './ai-governance-helpers.js';

export function viewAiOperations() {
  const s = getState();
  const cfg = s.platformConfig || {};
  const rows = (s.aiExecutions || []).slice(0, 20).map((e) => {
    const a = e.analysisId ? getAnalysis(s, e.analysisId) : null;
    return `<tr>
      <td><a href="#/ai-execution/${esc(e.id)}">${esc(e.id)}</a></td>
      <td>${esc(e.analysisType || '—')}</td>
      <td>${esc(e.targetEntityType)} ${esc(e.targetEntityId)}</td>
      <td>${badge(e.status)}</td>
      <td>${esc(e.executionMode)}</td>
      <td>${esc(e.modelId)}</td>
      <td>${e.latencyMs ?? '—'}ms</td>
      <td>${esc(e.qualityGateResult || '—')}</td>
      <td>${a ? `<a href="#/ai-analysis/${esc(a.id)}">${esc(a.id)}</a>` : '—'}</td>
    </tr>`;
  });
  const prov = (s.aiProviders || []).map(
    (p) => `<li>${esc(p.name)} — <strong>${esc(p.status)}</strong> · Credential: ${esc(p.credentialStatus)}</li>`
  ).join('');
  return `${pageHeader('AI Operations', 'Technical AI execution monitoring — separate from AI Governance outcomes (MOCK / fixture default).')}
    <section class="ri-panel ri-panel--compact">
      <p>Runtime mode: <strong>${esc(cfg.aiExecutionMode || 'fixture')}</strong> · Live AI verification: <strong>${cfg.allowLiveAiVerification ? 'Enabled' : 'Disabled'}</strong></p>
      <ul>${prov}</ul>
      <p class="ri-muted">External provider credentials are never stored in the browser. Production AI calls must run server-side.</p>
    </section>
    <section class="ri-panel"><h2>Recent executions</h2>
      ${dataTable(['Execution', 'Use case', 'Entity', 'Status', 'Mode', 'Model', 'Latency', 'Quality', 'Analysis'], rows, 'No executions yet')}
    </section>
    <p><a href="#/ai-governance">AI Governance register</a> · <a href="#/admin/platform">Platform</a></p>`;
}

export function viewAiExecutionDetail(id) {
  const s = getState();
  const e = (s.aiExecutions || []).find((x) => x.id === id);
  const tid = s.tenantContext?.tenantId || 'TEN-DEMO-001';
  if (!e || (e.tenantId && e.tenantId !== tid)) return notFoundState('AI Execution', id);
  const a = e.analysisId ? getAnalysis(s, e.analysisId) : null;
  return `${pageHeader('AI Execution', id)}
    ${entityHero(id, e.analysisType || 'AI execution', [
      { label: 'Status', value: e.status, badge: true },
      { label: 'Mode', value: e.executionMode },
      { label: 'Provider', value: e.providerId },
      { label: 'Model', value: e.modelId },
      { label: 'Latency', value: e.latencyMs ? `${e.latencyMs}ms` : '—' },
    ])}
    <section class="ri-panel"><h2>Request</h2>
      <dl class="ri-dl">
        <dt>Use case</dt><dd>${esc(e.useCaseId)}</dd>
        <dt>Entity</dt><dd>${esc(e.targetEntityType)} ${esc(e.targetEntityId)}</dd>
        <dt>Correlation</dt><dd>${esc(e.correlationId)}</dd>
        <dt>Organisation profile</dt><dd>${esc(e.organisationProfileVersion)}</dd>
      </dl>
    </section>
    <section class="ri-panel"><h2>Safety &amp; validation</h2>
      <p>Safety: ${esc(e.safetyStatus)} · Citations: ${esc(e.citationValidationStatus)} · Schema: ${esc(e.responseValidationStatus)} · Quality gate: ${esc(e.qualityGateResult)}</p>
      ${e.promptInjectionWarnings?.length ? `<p class="ri-alert">Prompt-injection warning(s) detected — source treated as untrusted evidence only.</p>` : ''}
      ${e.errorCode ? `<p class="ri-alert">${esc(e.errorCode)}</p>` : ''}
    </section>
    <section class="ri-panel"><h2>Usage (mock)</h2>
      <p>Input tokens (est.): ${e.inputTokenEstimate ?? '—'} · Output tokens (est.): ${e.outputTokenEstimate ?? '—'} · Cost (mock): ${e.estimatedCost ?? '—'}</p>
    </section>
    ${a ? `<p>Linked AI Analysis (governed record): <a href="#/ai-analysis/${esc(a.id)}">${esc(a.id)}</a> · Human review: ${a.humanReviewRequired ? 'Required' : 'Not required'}</p>` : ''}
    <p><a href="#/ai-operations">← AI Operations</a></p>`;
}
