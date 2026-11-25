/**
 * Reads the last QA orchestrator report. Technical pass is not regulatory approval.
 */
import { esc, pageHeader } from '../components.js';

export function viewQaDashboard() {
  return `${pageHeader({
    eyebrow: 'ENGINEERING',
    title: 'Quality assurance',
    subtitle: 'Technical test evidence only. This is not business UAT approval or production authorisation.',
  })}
  <section class="ri-panel" data-qa-dashboard>
    <p class="ri-muted" data-qa-status>Loading the latest QA report…</p>
    <div data-qa-metrics></div>
    <div data-qa-results></div>
  </section>`;
}

export async function hydrateQaDashboard(doc = document) {
  const host = doc.querySelector('[data-qa-dashboard]');
  if (!host || host.dataset.loading === '1') return;
  host.dataset.loading = '1';
  const status = host.querySelector('[data-qa-status]');
  try {
    const res = await fetch('/design-lab/regulatory-intelligence/qa/latest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('qa_report_missing');
    const report = await res.json();
    const build = (doc.querySelector('script[src*="app.js"]')?.getAttribute('src') || '').match(/[?&]v=([a-f0-9]+)/i)?.[1] || '';
    const head = String(report.gitHead || '');
    const stale = Boolean(build && head && !head.startsWith(build));
    const dep = report.latestKnownDeployment || {};
    const deployment = dep.id || 'none recorded';
    const candidatePreview = dep.previewDeploymentId || '—';
    const protectedOfficial = dep.protectedOfficialDeploymentId || '—';
    const preAuth = dep.prePromotionAuth?.status || '—';
    if (status) {
      status.textContent = stale
        ? `Stale report for commit ${head.slice(0, 12)}. This build is ${build}. It is not the current release result.`
        : `Technical tests: ${report.technicalTests || 'NOT RUN'}. Authenticated staging: ${report.authenticatedStaging || 'NOT RUN'}. Security validation: ${report.securityValidation || 'NOT RUN'}. Promotion: ${report.promotion || 'NOT RUN'}. Pre-promotion auth: ${preAuth}. Business UAT approved: no. Production authorised: no. Commit ${head.slice(0, 12) || 'unknown'}. Official deployment ${deployment}. Protected rollback ${protectedOfficial}. Candidate preview ${candidatePreview}. Executed ${report.generatedAt || 'unknown'}.`;
    }
    const metrics = host.querySelector('[data-qa-metrics]');
    if (metrics && !stale) {
      metrics.innerHTML = `<div class="ri-metrics ri-metrics--wrap">
        <div class="ri-metric"><span class="ri-metric__label">Passed</span><span class="ri-metric__value">${esc(report.passed ?? 0)}</span></div>
        <div class="ri-metric"><span class="ri-metric__label">Failed</span><span class="ri-metric__value">${esc(report.failed ?? 0)}</span></div>
        <div class="ri-metric"><span class="ri-metric__label">Blocked</span><span class="ri-metric__value">${esc(report.blocked ?? 0)}</span></div>
        <div class="ri-metric"><span class="ri-metric__label">Catalogue</span><span class="ri-metric__value">${esc(report.catalogueSize ?? 0)}</span></div>
      </div>`;
    }
    const results = host.querySelector('[data-qa-results]');
    if (results && !stale) {
      const rows = (report.results || [])
        .map(
          (row) =>
            `<tr><td>${esc(row.id)}</td><td>${esc(row.feature)}</td><td>${esc(row.type)}</td><td>${esc(row.status)}</td></tr>`,
        )
        .join('');
      const gaps = (report.coverageGaps || [])
        .map((row) => `<tr><td>${esc(row.id)}</td><td>${esc(row.feature)}</td><td>${esc(row.note)}</td><td>${esc(row.status || 'NOT RUN')}</td></tr>`)
        .join('');
      results.innerHTML = `<table class="ri-table"><thead><tr><th>Test</th><th>Feature</th><th>Type</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Coverage not yet automated</h2>
        <table class="ri-table"><thead><tr><th>Id</th><th>Feature</th><th>Note</th><th>Result</th></tr></thead><tbody>${gaps}</tbody></table>`;
    }
  } catch {
    if (status) status.textContent = 'Technical tests: NOT RUN. No QA report has been published with this build.';
  }
}
