import { getState, personName } from './store.js';
import { esc, badge, pageHeader, dataTable, formatDate, formatDateTime, entityHero, notFoundState, linkRecord } from './components.js';
import { connectorHealth, ingestionMetrics, PIPELINE_STAGES } from './ingestion-helpers.js';
import {
  getRegulatorySource,
  getConnector,
  getIngestionRun,
  getRawSourceItem,
  getSourceDocument,
  getSourceSection,
  getChangeCandidate,
  getRawItemsForRun,
  getDocumentsForPublication,
  getSectionsForDocument,
  renderProvenanceList,
  provenanceChainForChange,
} from './ingestion-relationships.js';
import {
  getLiveVerificationEvidence,
  liveVerifiedSummary,
  renderLiveVerificationBadge,
  renderLiveItemDetail,
} from './live-verification-evidence.js';
import { LEGISLATION_VERIFICATION_EVIDENCE } from './legislation-verification-evidence-data.js';
import { TPR_VERIFICATION_EVIDENCE } from './tpr-verification-evidence-data.js';
import { BASEL_VERIFICATION_EVIDENCE } from './basel-verification-evidence-data.js';

function tprVerifiedSummary() {
  const ev = TPR_VERIFICATION_EVIDENCE;
  const verified = ev.status === 'LIVE_VERIFIED';
  return {
    verified,
    lastVerifiedAt: ev.lastVerifiedAt,
    detected: ev.verifiedRecordIds?.length || 0,
    health: verified ? 'Healthy' : ev.status === 'ERROR' ? 'Verification Failed' : 'Not Verified',
    status: ev.status,
    families: (ev.sourceFamiliesVerified || []).join(' · ') || '—',
  };
}

function baselVerifiedSummary() {
  const ev = BASEL_VERIFICATION_EVIDENCE;
  const verified = ev.status === 'LIVE_VERIFIED';
  return {
    verified,
    lastVerifiedAt: ev.lastVerifiedAt,
    detected: ev.verifiedRecordIds?.length || 0,
    health: verified ? 'Healthy' : ev.status === 'ERROR' ? 'Verification Failed' : 'Not Verified',
    status: ev.status,
    families: (ev.sourceFamiliesVerified || []).join(' · ') || '—',
  };
}

function legislationVerifiedSummary() {
  const ev = LEGISLATION_VERIFICATION_EVIDENCE;
  const verified = ev.status === 'LIVE_VERIFIED';
  return {
    verified,
    lastVerifiedAt: ev.lastVerifiedAt,
    detected: ev.verifiedRecordIds?.length || 0,
    health: verified ? 'Healthy' : ev.status === 'ERROR' ? 'Verification Failed' : 'Not Verified',
    status: ev.status,
  };
}

function renderLiveVerificationMonitorSection() {
  const fca = liveVerifiedSummary('FCA');
  const pra = liveVerifiedSummary('PRA');
  const hmt = liveVerifiedSummary('HMT');
  const leg = legislationVerifiedSummary();
  const tpr = tprVerifiedSummary();
  const basel = baselVerifiedSummary();
  const ev = getLiveVerificationEvidence();
  return `<section class="ri-panel">
    <h2>Live regulatory source verification</h2>
    <p class="ri-muted">Persisted verification snapshot — shows <strong>last live verification</strong>, not continuous polling. Browser UI displays evidence captured by the Node verification runner; production scheduling is not configured.</p>
    <div class="ri-live-verify-grid">
      <div class="ri-panel ri-panel--compact">
        <h3>FCA <span class="ri-muted">· Official Regulator</span></h3>
        <p>${badge(fca.health)} ${renderLiveVerificationBadge(fca.verified)}</p>
        <ul class="ri-list ri-list--compact">
          <li>Last live verification: <strong>${fca.lastVerifiedAt ? formatDateTime(fca.lastVerifiedAt) : '—'}</strong></li>
          <li>Detected (that run): <strong>${fca.detected}</strong></li>
          <li>Polling: <strong>Manual</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/ingestion/live-verification#fca">View retrieved items</a>
      </div>
      <div class="ri-panel ri-panel--compact">
        <h3>PRA <span class="ri-muted">· Official Regulator</span></h3>
        <p>${badge(pra.health)} ${renderLiveVerificationBadge(pra.verified)}</p>
        <ul class="ri-list ri-list--compact">
          <li>Last live verification: <strong>${pra.lastVerifiedAt ? formatDateTime(pra.lastVerifiedAt) : '—'}</strong></li>
          <li>Via official Bank of England feeds${ev?.pra?.fallbackNewsFeedUsed ? ' (news RSS fallback)' : ''}</li>
          <li>Detected (that run): <strong>${pra.detected}</strong></li>
          <li>Polling: <strong>Manual</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/ingestion/live-verification#pra">View retrieved items</a>
      </div>
      <div class="ri-panel ri-panel--compact">
        <h3>HM Treasury <span class="ri-muted">· Government / Policy · Horizon Scanning</span></h3>
        <p>${badge(hmt.health)} ${renderLiveVerificationBadge(hmt.verified)}</p>
        <ul class="ri-list ri-list--compact">
          <li>Official GOV.UK · ${esc(hmt.sourceTrust || 'Official Government Source')}</li>
          <li>Last live verification: <strong>${hmt.lastVerifiedAt ? formatDateTime(hmt.lastVerifiedAt) : '—'}</strong></li>
          <li>Detected (relevant): <strong>${hmt.detected}</strong></li>
          <li>Polling: <strong>Manual</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/ingestion/live-verification#hmt">View retrieved items</a>
      </div>
      <div class="ri-panel ri-panel--compact">
        <h3>UK Legislation <span class="ri-muted">· The National Archives</span></h3>
        <p>${badge(leg.health)} ${leg.verified ? '<span class="ri-badge ri-badge--ok">LIVE VERIFIED</span>' : '<span class="ri-badge ri-badge--muted">Not verified</span>'}</p>
        <ul class="ri-list ri-list--compact">
          <li>Source: <strong>legislation.gov.uk</strong></li>
          <li>Last check: <strong>${leg.lastVerifiedAt ? formatDateTime(leg.lastVerifiedAt) : '—'}</strong></li>
          <li>Mapped frameworks verified: <strong>${leg.detected}</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/legislation/staging">Legislation staging</a>
      </div>
      <div class="ri-panel ri-panel--compact">
        <h3>The Pensions Regulator <span class="ri-muted">· TPR</span></h3>
        <p>${badge(tpr.health)} ${tpr.verified ? '<span class="ri-badge ri-badge--ok">LIVE VERIFIED</span>' : '<span class="ri-badge ri-badge--muted">Not verified</span>'}</p>
        <ul class="ri-list ri-list--compact">
          <li>Source: <strong>thepensionsregulator.gov.uk</strong></li>
          <li>Last check: <strong>${tpr.lastVerifiedAt ? formatDateTime(tpr.lastVerifiedAt) : '—'}</strong></li>
          <li>Verified families: <strong>${esc(tpr.families)}</strong></li>
          <li>Records verified: <strong>${tpr.detected}</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/tpr/staging">TPR staging</a>
      </div>
      <div class="ri-panel ri-panel--compact">
        <h3>Basel / BIS <span class="ri-muted">· BCBS</span></h3>
        <p>${badge(basel.health)} ${basel.verified ? '<span class="ri-badge ri-badge--ok">LIVE VERIFIED</span>' : '<span class="ri-badge ri-badge--muted">Not verified</span>'}</p>
        <ul class="ri-list ri-list--compact">
          <li>Source: <strong>bis.org</strong> · Basel Framework</li>
          <li>Last check: <strong>${basel.lastVerifiedAt ? formatDateTime(basel.lastVerifiedAt) : '—'}</strong></li>
          <li>Verified families: <strong>${esc(basel.families)}</strong></li>
          <li>Records verified: <strong>${basel.detected}</strong></li>
        </ul>
        <a class="ri-btn ri-btn--sm ri-btn--ghost" href="#/basel/staging">Basel staging</a>
      </div>
    </div>
    <p class="ri-muted">Production polling: <strong>Not configured</strong> · Fixture mode: <strong>Default</strong> for demos and deterministic tests</p>
  </section>`;
}

export function viewIngestionMonitor() {
  const s = getState();
  const metrics = ingestionMetrics(s);
  const sources = (s.regulatorySources || []).map((src) => {
    const conn = s.sourceConnectors?.find((c) => c.sourceId === src.id && c.enabled) || s.sourceConnectors?.find((c) => c.sourceId === src.id);
    const fixtureHealth = conn ? connectorHealth(conn, src) : 'Disabled';
    let liveCol = '—';
    let lastVerified = '—';
    let detected = '—';
    let polling = 'Manual';
    let status = fixtureHealth;
    if (src.id === 'SRC-FCA') {
      const lv = liveVerifiedSummary('FCA');
      liveCol = lv.verified ? 'LIVE VERIFIED' : 'Fixture / Demo';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
    } else if (src.id === 'SRC-PRA') {
      const lv = liveVerifiedSummary('PRA');
      liveCol = lv.verified ? 'LIVE VERIFIED' : 'Fixture / Demo';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
    } else if (src.id === 'SRC-BOE') {
      liveCol = 'N/A';
      lastVerified = '—';
      detected = '—';
      polling = 'Standalone disabled';
      status = 'Disabled';
    } else if (src.id === 'SRC-HMT') {
      const lv = liveVerifiedSummary('HMT');
      liveCol = lv.verified ? 'LIVE VERIFIED' : 'Fixture / Demo';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
      polling = 'Manual';
    } else if (src.id === 'SRC-TPR') {
      const lv = tprVerifiedSummary();
      liveCol = lv.verified ? 'LIVE VERIFIED' : lv.status === 'SOURCE_UNAVAILABLE' ? 'SOURCE UNAVAILABLE' : 'Not checked';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
      polling = 'Manual';
    } else if (src.id === 'SRC-LEG') {
      const lv = legislationVerifiedSummary();
      liveCol = lv.verified ? 'LIVE VERIFIED' : lv.status === 'SOURCE_UNAVAILABLE' ? 'SOURCE UNAVAILABLE' : 'Not checked';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
      polling = 'Manual';
    } else if (src.id === 'SRC-BASEL') {
      const lv = baselVerifiedSummary();
      liveCol = lv.verified ? 'LIVE VERIFIED' : lv.status === 'SOURCE_UNAVAILABLE' ? 'SOURCE UNAVAILABLE' : 'Not checked';
      lastVerified = lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
      detected = String(lv.detected);
      status = lv.verified ? lv.health : fixtureHealth;
      polling = 'Manual';
    }
    const seededNote =
      (src.id === 'SRC-FCA' || src.id === 'SRC-PRA') && src.lastSuccessfulCheck
        ? `<span class="ri-muted"> (seed demo: ${formatDate(src.lastSuccessfulCheck)})</span>`
        : '';
    return `<tr>
      <td>${esc(src.shortName)}</td>
      <td>${esc(src.jurisdiction)}</td>
      <td>${conn ? `<a href="#/admin/sources">${esc(conn.name)}</a>` : src.id === 'SRC-BOE' ? 'Supporting infrastructure (PRA)' : '—'}</td>
      <td>${badge(status)}</td>
      <td>${esc(liveCol)}</td>
      <td>${lastVerified}${seededNote}</td>
      <td>${detected}</td>
      <td>${esc(polling)}</td>
    </tr>`;
  });

  const runs = (s.ingestionRuns || []).slice(0, 12).map((r) => {
    const conn = getConnector(r.connectorId);
    const src = conn ? getRegulatorySource(conn.sourceId) : null;
    return `<tr>
      <td><a href="#/ingestion/run/${esc(r.id)}">${esc(r.id)}</a></td>
      <td>${esc(src?.shortName || '—')}</td>
      <td>${formatDateTime(r.startedAt)}</td>
      <td>${formatDateTime(r.completedAt)}</td>
      <td>${badge(r.status)}</td>
      <td>${r.detectedCount}</td>
      <td>${r.newCount}</td>
      <td>${r.updatedCount}</td>
      <td>${r.duplicateCount}</td>
      <td>${r.failedCount}</td>
    </tr>`;
  });

  const exceptions = (s.ingestionExceptions || []).map(
    (e) => `<tr>
      <td>${badge(e.severity)}</td>
      <td>${esc(e.type)}</td>
      <td>${esc(e.message)}</td>
      <td><a href="#/ingestion/item/${esc(e.rawSourceItemId)}">${esc(e.rawSourceItemId)}</a></td>
      <td>${formatDateTime(e.timestamp)}</td>
    </tr>`
  );

  const cfg = s.platformConfig || {};
  const connectorMode = cfg.regulatoryConnectorMode || 'fixture';
  const liveEnabled = cfg.allowLiveRegulatoryVerification;
  const staged = (s.liveVerificationStaging || []).length;
  return `${pageHeader(
    'Regulatory Ingestion Monitor',
    'MOCK CONNECTOR (legacy demo path) + FIXTURE / LIVE VERIFICATION connector layer — Design Lab only; production polling not enabled.'
  )}
    <section class="ri-panel ri-panel--compact">
      <h2>Connector mode</h2>
      <p>Active configuration: <strong>${esc(connectorMode)}</strong> · Live verification: <strong>${liveEnabled ? 'Enabled (manual)' : 'Disabled'}</strong> · Staged live items: <strong>${staged}</strong></p>
      <p class="ri-muted">Fixture mode is default for deterministic tests. Live verification performs a small read-only check against official public sources when explicitly enabled.</p>
    </section>
    ${renderLiveVerificationMonitorSection()}
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-run-mock-ingestion>Run mock ingestion</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-run-fixture-fca>Run FCA fixture check</button>
      ${liveEnabled ? '<button type="button" class="ri-btn ri-btn--ghost" data-live-verify-fca data-confirm-live>Run live verification (FCA)</button>' : ''}
      <a class="ri-btn ri-btn--ghost" href="#/admin/sources">Source &amp; connector admin</a>
      <a class="ri-btn ri-btn--ghost" href="#/ingestion/live-verification">Live verification evidence</a>
    </div>
    <section class="ri-panel">
      <h2>Ingestion summary</h2>
      <ul class="ri-metrics-inline">
        <li>Sources monitored: <strong>${metrics.sourcesMonitored}</strong></li>
        <li>New publications (period): <strong>${metrics.newPublications}</strong></li>
        <li>Duplicates suppressed: <strong>${metrics.duplicatesSuppressed}</strong></li>
        <li>Processing failures: <strong>${metrics.processingFailures}</strong></li>
        <li>Awaiting triage: <strong>${metrics.awaitingTriage}</strong></li>
        <li>Re-analysis required: <strong>${metrics.reanalysisRequired}</strong></li>
      </ul>
    </section>
    <section class="ri-panel"><h2>Regulatory sources (runtime + live evidence)</h2>
      <p class="ri-muted">“Last live verification” uses the saved verification snapshot. Seeded demo dates in parentheses are not current live status.</p>
      ${dataTable(['Source', 'Jurisdiction', 'Connector', 'Status', 'Live verification', 'Last live verification', 'Detected (live run)', 'Polling'], sources)}
    </section>
    <section class="ri-panel"><h2>Recent ingestion runs</h2>
      ${dataTable(['Run', 'Source', 'Started', 'Completed', 'Status', 'Detected', 'New', 'Updated', 'Duplicate', 'Failed'], runs)}
    </section>
    <section class="ri-panel"><h2>Exceptions</h2>
      ${dataTable(['Severity', 'Type', 'Message', 'Item', 'When'], exceptions, 'No ingestion exceptions')}
    </section>`;
}

export function viewIngestionRun(runId) {
  const run = getIngestionRun(runId);
  if (!run) return notFoundState('Ingestion Run', runId);
  const conn = getConnector(run.connectorId);
  const src = conn ? getRegulatorySource(conn.sourceId) : null;
  const items = getRawItemsForRun(runId).map(
    (r) => `<tr>
      <td><a href="#/ingestion/item/${esc(r.id)}">${esc(r.id)}</a></td>
      <td>${esc(r.referenceRaw)}</td>
      <td>${badge(r.processingStatus)}</td>
      <td>${esc(r.duplicateClassification || '—')}</td>
      <td>${r.linkedPublicationId ? linkRecord('Publication', r.linkedPublicationId) : '—'}</td>
    </tr>`
  );
  return `${pageHeader('Ingestion Run', runId)}
    ${entityHero(runId, `${src?.shortName || 'Source'} connector run`, [
      { label: 'Connector', value: conn?.name || run.connectorId },
      { label: 'Status', value: run.status, badge: true },
      { label: 'Started', value: formatDateTime(run.startedAt) },
      { label: 'Completed', value: formatDateTime(run.completedAt) },
      { label: 'Triggered by', value: run.triggeredBy },
    ])}
    <section class="ri-panel"><h2>Counts</h2>
      <p>Detected: <strong>${run.detectedCount}</strong> · New: <strong>${run.newCount}</strong> · Updated: <strong>${run.updatedCount}</strong> · Duplicate: <strong>${run.duplicateCount}</strong> · Failed: <strong>${run.failedCount}</strong></p>
      <p class="ri-muted">Checkpoint: ${esc(run.checkpointBefore)} → ${esc(run.checkpointAfter)}</p>
      ${run.errorSummary ? `<p class="ri-alert">${esc(run.errorSummary)}</p>` : ''}
    </section>
    <section class="ri-panel"><h2>Raw source items</h2>
      ${dataTable(['Item', 'Reference', 'Processing', 'Duplicate / version', 'Publication'], items, 'No items in this run')}
    </section>
    <p><a href="#/ingestion">← Ingestion Monitor</a></p>`;
}

export function viewIngestionItem(itemId) {
  const raw = getRawSourceItem(itemId);
  if (!raw) return notFoundState('Raw Source Item', itemId);
  const s = getState();
  const src = getRegulatorySource(raw.sourceId);
  const conn = getConnector(raw.connectorId);
  const run = raw.ingestionRunId ? getIngestionRun(raw.ingestionRunId) : null;
  const doc = raw.linkedSourceDocumentId ? getSourceDocument(raw.linkedSourceDocumentId) : null;
  const sections = doc ? getSectionsForDocument(doc.id) : [];
  const norm = raw.normalized || null;
  const pub = raw.linkedPublicationId ? s.publications.find((p) => p.id === raw.linkedPublicationId) : null;
  const pipelineIdx = PIPELINE_STAGES.indexOf(mapRawToPipeline(raw.processingStatus));
  const pipeline = PIPELINE_STAGES.map((st, i) => `<li class="${i <= pipelineIdx ? 'is-done' : ''}">${esc(st)}</li>`).join('');

  const versionBlock =
    raw.versionDiffSummary || doc?.versionChangeSummary
      ? `<section class="ri-panel"><h2>Version changes</h2><pre class="ri-pre">${esc(JSON.stringify(raw.versionDiffSummary || doc.versionChangeSummary, null, 2))}</pre></section>`
      : '';

  const retry =
    raw.retryEligible && raw.processingStatus === 'Failed'
      ? `<button type="button" class="ri-btn ri-btn--primary" data-retry-raw="${esc(raw.id)}">Retry processing</button>`
      : '';

  const candidates = (s.changeCandidates || [])
    .filter((c) => c.rawSourceItemId === raw.id || c.publicationId === raw.linkedPublicationId)
    .map(
      (c) => `<li><a href="#/ingestion/candidate/${esc(c.id)}">${esc(c.id)}</a> — ${esc(c.proposedTitle)} (${esc(c.status)})</li>`
    )
    .join('');

  return `${pageHeader('Ingestion Item', itemId)}
    ${entityHero(itemId, raw.titleRaw, [
      { label: 'Source', value: src?.shortName },
      { label: 'Processing', value: raw.processingStatus, badge: true },
      { label: 'Detected', value: formatDateTime(raw.detectedAt) },
      { label: 'Reference', value: raw.referenceRaw, mono: true },
    ])}
    <ol class="ri-pipeline">${pipeline}</ol>
    <section class="ri-panel"><h2>Detection</h2>
      <dl class="ri-dl">
        <dt>Connector</dt><dd>${conn ? `<a href="#/admin/sources">${esc(conn.name)}</a>` : '—'} <span class="ri-muted">(${esc(conn?.mode || 'MOCK')})</span></dd>
        <dt>Ingestion run</dt><dd>${run ? `<a href="#/ingestion/run/${esc(run.id)}">${esc(run.id)}</a>` : '—'}</dd>
        <dt>External ID (mock)</dt><dd><code>${esc(raw.externalIdMock)}</code></dd>
      </dl>
    </section>
    <section class="ri-panel"><h2>Retrieval</h2>
      <p><span class="ri-label">Mock URL</span> <a href="${esc(raw.sourceUrlMock)}">${esc(raw.sourceUrlMock)}</a></p>
      <p>Retrieval status: ${badge(raw.retrievalStatus)} · Checksum: <code>${esc(raw.checksumMock || '—')}</code></p>
      ${raw.failureReason ? `<p class="ri-alert">${esc(raw.failureReason)}</p>${retry}` : ''}
    </section>
    <section class="ri-panel"><h2>Duplicate / version check</h2>
      <p>${esc(raw.duplicateClassification || 'Not classified as duplicate')}</p>
      <p class="ri-muted">${esc(raw.duplicateReason || '')}</p>
      ${doc?.previousVersionId ? `<p>Previous version document: <a href="#/source-document/${esc(doc.previousVersionId)}">${esc(doc.previousVersionId)}</a></p>` : ''}
      ${raw.id === 'RAW-FCA-PS26-14-V2' ? '<p>Prior version: <a href="#/source-document/DOC-FCA-PS26-14-V1">DOC-FCA-PS26-14-V1</a></p>' : ''}
    </section>
    ${versionBlock}
    <section class="ri-panel"><h2>Result</h2>
      <p>Source Document: ${doc ? `<a href="#/source-document/${esc(doc.id)}">${esc(doc.id)}</a> (v${doc.documentVersion})` : '—'}</p>
      <p>Regulatory Publication: ${pub ? linkRecord('Publication', pub.id) : '—'}</p>
      ${pub?.reanalysisRequired ? `<p class="ri-alert">Re-analysis required — ${esc(pub.reanalysisReason || 'Source document updated')}</p>` : ''}
      ${candidates ? `<h3>Candidate Regulatory Changes</h3><ul>${candidates}</ul>` : ''}
      ${doc ? `<p>Parsed sections: ${sections.length} — ${sections.map((s) => `<a href="#/publication/${esc(s.publicationId)}/source/${esc(s.citationSlug)}">${esc(s.citation)}</a>`).join(', ')}</p>` : ''}
    </section>
    <p><a href="#/ingestion">← Ingestion Monitor</a></p>`;
}

function mapRawToPipeline(status) {
  const m = {
    Detected: 'Detected',
    Retrieved: 'Retrieved',
    Normalised: 'Normalised',
    Duplicate: 'Version Checked',
    'Version Update': 'Version Checked',
    Parsed: 'Parsed',
    'Published to Intake': 'Ready for Triage',
    Failed: 'Detected',
  };
  return m[status] || 'Detected';
}

export function viewSourceDocument(docId) {
  const doc = getSourceDocument(docId);
  if (!doc) return notFoundState('Source Document', docId);
  const sections = getSectionsForDocument(docId);
  const prev = doc.previousVersionId ? getSourceDocument(doc.previousVersionId) : null;
  const s = getState();
  const pub = doc.publicationId ? s.publications.find((p) => p.id === doc.publicationId) : null;
  return `${pageHeader('Source Document', docId)}
    ${entityHero(docId, doc.title, [
      { label: 'Reference', value: doc.documentReference, mono: true },
      { label: 'Version', value: String(doc.documentVersion) },
      { label: 'Checksum', value: doc.checksumMock, mono: true },
      { label: 'Status', value: doc.processingStatus, badge: true },
    ])}
    <section class="ri-panel"><h2>Provenance</h2>
      <p>MOCK CONNECTOR · Parser ${esc(doc.parserVersion)} · Retrieved ${formatDateTime(doc.retrievedAt)}</p>
      ${doc.reanalysisRequired ? `<p class="ri-alert">Re-analysis required for linked Publication</p>` : ''}
      ${prev ? `<p>Previous version: <a href="#/source-document/${esc(prev.id)}">${esc(prev.id)}</a>${prev.superseded ? ' (superseded)' : ''}</p>` : ''}
      ${pub ? `<p>Regulatory Publication: ${linkRecord('Publication', pub.id)}</p>` : ''}
    </section>
    <section class="ri-panel"><h2>Source sections</h2>
      <ul>${sections.map((sec) => `<li><a href="#/publication/${esc(sec.publicationId)}/source/${esc(sec.citationSlug)}">${esc(sec.citation)}</a> — ${esc(sec.heading)}</li>`).join('')}</ul>
    </section>
    ${doc.versionChangeSummary ? `<section class="ri-panel"><h2>Changes from previous version</h2><ul>${(doc.versionChangeSummary.changedParagraphs || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>` : ''}
    <p><a href="#/ingestion">← Ingestion Monitor</a></p>`;
}

export function viewChangeCandidate(id) {
  const cand = getChangeCandidate(id);
  if (!cand) return notFoundState('Change Candidate', id);
  const sec = cand.sourceSectionIds?.[0] ? getSourceSection(cand.sourceSectionIds[0]) : null;
  const s = getState();
  return `${pageHeader('Candidate Regulatory Change', id)}
    <p class="ri-muted">AI-generated candidate — human review required before creating a Regulatory Change record.</p>
    ${entityHero(id, cand.proposedTitle, [
      { label: 'Status', value: cand.status, badge: true },
      { label: 'Confidence', value: `${cand.confidence}%` },
      { label: 'Materiality', value: cand.materialityRecommendation, badge: true },
    ])}
    <section class="ri-panel"><h2>Proposed change</h2><p>${esc(cand.proposedDescription)}</p>
      <p><strong>Applicability recommendation:</strong> ${esc(cand.applicabilityRecommendation)}</p>
      <p class="ri-muted">${esc(cand.reasoning)}</p>
      ${sec ? `<p>Source citation: <a href="#/publication/${esc(sec.publicationId || cand.publicationId)}/source/${esc(sec.citationSlug)}">${esc(sec.citation)}</a></p>` : '<p class="ri-muted">Source citation: FG27/3 §2.1 (mock) — available after ingestion parsing.</p>'}
    </section>
    ${cand.status === 'Review Required' || cand.status === 'Proposed' ? `
    <div class="ri-form__actions">
      <button type="button" class="ri-btn ri-btn--primary" data-accept-candidate="${esc(id)}">Accept candidate</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-modify-candidate="${esc(id)}">Accept with modification</button>
      <button type="button" class="ri-btn ri-btn--ghost" data-reject-candidate="${esc(id)}">Reject candidate</button>
    </div>` : ''}
    ${cand.acceptedChangeId ? `<p>Linked Regulatory Change: ${linkRecord('Regulatory Change', cand.acceptedChangeId)}</p>` : ''}
    <p><a href="#/ingestion">← Ingestion Monitor</a></p>`;
}

export function viewLiveVerificationEvidence(anchor = '') {
  const ev = getLiveVerificationEvidence();
  const fcaItems = ev?.fca?.items || [];
  const praItems = ev?.pra?.items || [];
  const hmtItems = ev?.hmt?.items || [];
  const fcaBlock = fcaItems.map((item) => renderLiveItemDetail(item, 'FCA — Official Regulator')).join('');
  const praBlock = praItems.map((item) => renderLiveItemDetail(item, 'PRA — Official Regulator (Bank of England)')).join('');
  const hmtBlock = hmtItems.map((item) =>
    renderLiveItemDetail(
      {
        ...item,
        authority: item.authority || 'HM Treasury',
        authorityType: item.authorityType || 'Government / Policy',
        sourceRole: item.sourceRole || 'Horizon Scanning',
        regulator: 'HM Treasury',
      },
      'HM Treasury — Government / Policy (Horizon Scanning)'
    )
  ).join('');
  return `${pageHeader({
    eyebrow: 'LIVE SOURCE VERIFICATION',
    title: 'FCA, PRA & HM Treasury network evidence',
    subtitle: ev?.verificationType || 'Persisted live verification snapshot (not fixture demo dates)',
    meta: `HMT run: ${ev?.hmt?.lastVerifiedAt ? formatDateTime(ev.hmt.lastVerifiedAt) : '—'}`,
    actions: `<a class="ri-btn ri-btn--ghost" href="#/admin/sources">Regulatory sources</a>`,
  })}
    <p class="ri-live-verify-banner"><strong>LIVE SOURCE VERIFICATION</strong> — evidence captured by the Node verification runner. The browser does not call external regulators directly (CORS / static Design Lab).</p>
    <p class="ri-muted">Re-run <code>live-hmt-verification.mjs</code> or <code>interim-live-fca-pra-verification.mjs</code> to refresh persisted evidence.</p>
    <p><a href="#/ingestion">← Ingestion Monitor</a> · <a href="#/admin/sources">Regulatory sources</a></p>
    <section class="ri-panel" id="fca">
      <h2>FCA — Live Retrieved Items (${fcaItems.length})</h2>
      <p>Feed: <span class="ri-mono">${esc(ev?.fca?.discoveryFeedUrl || '')}</span> · HTTP ${esc(String(ev?.fca?.http?.httpStatus || '—'))} · ${renderLiveVerificationBadge(true)}</p>
      ${fcaBlock || '<p class="ri-muted">No FCA items in evidence snapshot.</p>'}
    </section>
    <section class="ri-panel" id="pra">
      <h2>PRA / Bank of England — Live Retrieved Items (${praItems.length})</h2>
      <p>Official host: Bank of England · Publications feed checked · ${ev?.pra?.fallbackNewsFeedUsed ? 'PRA items retrieved via BoE news RSS fallback' : 'PRA filter on publications feed'}</p>
      <p>Feed used for items: <span class="ri-mono">${esc(ev?.pra?.discoveryFeedUrl || '')}</span> · HTTP ${esc(String(ev?.pra?.http?.httpStatus || '—'))}</p>
      ${praBlock || '<p class="ri-muted">No PRA items in evidence snapshot.</p>'}
    </section>
    <section class="ri-panel" id="hmt">
      <h2>HM Treasury — Live Retrieved Items (${hmtItems.length})</h2>
      <p>Official GOV.UK Atom · Government / Policy · Horizon Scanning · Feed: <span class="ri-mono">${esc(ev?.hmt?.discoveryFeedUrl || '')}</span> · HTTP ${esc(String(ev?.hmt?.http?.httpStatus || '—'))}</p>
      ${hmtBlock || '<p class="ri-muted">No HM Treasury items in evidence snapshot.</p>'}
    </section>
    ${anchor ? `<p class="ri-muted">Anchor: ${esc(anchor)}</p>` : ''}`;
}

export function viewAdminSources() {
  const s = getState();
  const cfg = s.platformConfig || {};
  const connectorRows = (s.sourceConnectors || []).map((c) => {
    const src = getRegulatorySource(c.sourceId);
    const key = ['FCA', 'PRA', 'HMT'].includes(src?.shortName) ? src.shortName : null;
    const lv = key ? liveVerifiedSummary(key) : null;
    const liveLabel = lv?.verified ? 'LIVE VERIFIED' : key === 'HMT' && lv?.connection === 'FAIL' ? 'Verification Failed' : 'Fixture / Demo';
    const lastVerified = lv?.verified && lv.lastVerifiedAt ? formatDateTime(lv.lastVerifiedAt) : '—';
    const detected = lv?.verified ? String(lv.detected) : String(c.documentsDetectedLastRun ?? '—');
    const status = lv?.verified ? lv.health : connectorHealth(c, src);
    const roleNote =
      src?.shortName === 'HMT'
        ? `<br><span class="ri-muted">${esc(src.authorityType || 'Government / Policy')} · ${esc(src.sourceRole || 'Horizon Scanning')} · ${esc(src.sourceTrust || '')}</span>`
        : src?.shortName === 'FCA' || src?.shortName === 'PRA'
          ? '<br><span class="ri-muted">Official Regulator</span>'
          : '';
    return `<tr>
      <td>${esc(src?.shortName)}${roleNote}</td>
      <td>${esc(c.name)} <span class="ri-muted">(${esc(c.executionMode || c.mode || 'fixture')} runtime)</span></td>
      <td>${badge(status)}</td>
      <td>${esc(liveLabel)}</td>
      <td>${lastVerified}</td>
      <td>${detected}</td>
      <td>Manual</td>
      <td>Not configured</td>
      <td>${key ? `<a href="#/ingestion/live-verification#${key.toLowerCase()}">View retrieved items</a>` : '—'}
        <button type="button" class="ri-btn ri-btn--sm" data-toggle-connector="${esc(c.id)}" data-enabled="${c.enabled ? '0' : '1'}">${c.enabled ? 'Disable' : 'Enable'}</button></td>
    </tr>`;
  });

  const infraRows = [
    `<tr>
      <td>BoE</td>
      <td>Official supporting source (PRA connector)</td>
      <td>${badge('Disabled')}</td>
      <td>N/A</td>
      <td>—</td>
      <td>—</td>
      <td>Standalone ingestion disabled</td>
      <td>Not configured</td>
      <td class="ri-muted">PRA material is retrieved via official Bank of England RSS when live verification runs</td>
    </tr>`,
  ];

  return `${pageHeader('Regulatory Sources & Connectors', 'Fixture default for demos; live verification evidence shown separately from seeded demo dates')}
    <section class="ri-panel ri-panel--compact">
      <p>Connector mode: <strong>${esc(cfg.regulatoryConnectorMode || 'fixture')}</strong> · Runtime: <strong>MOCK CONNECTOR</strong> (fixture demo) + live verification layer · Production scheduler: <strong>Not configured</strong> · Polling: <strong>Manual</strong></p>
      <p>Live verification permission:
      <button type="button" class="ri-btn ri-btn--sm" data-toggle-live-verify>${cfg.allowLiveRegulatoryVerification ? 'Disable live verification' : 'Enable live verification (local)'}</button>
      · <a href="#/ingestion/live-verification">View last live verification evidence</a></p>
      <p class="ri-muted">Seeded connector “last run” dates (e.g. Oct 2026 / Aug 2026) are demo metadata only — see “Last live verification” for real network checks.</p>
    </section>
    ${dataTable(['Source', 'Connector', 'Status', 'Live verification', 'Last live verification', 'Detected', 'Polling', 'Production scheduler', ''], [...connectorRows, ...infraRows])}
    <p><a href="#/ingestion">Ingestion Monitor</a></p>`;
}

export function renderIngestionProvenancePanel(changeId) {
  const chain = provenanceChainForChange(changeId);
  if (chain.length < 3) return '';
  return `<section class="ri-panel ri-ingestion-prov"><h2>Source provenance</h2>${renderProvenanceList(chain)}</section>`;
}

export function renderDashboardIngestionSummary() {
  const s = getState();
  const metrics = ingestionMetrics(s);
  const lastRun = s.ingestionRuns?.[0];
  return `<section class="ri-panel ri-panel--compact">
    <h2>Regulatory ingestion</h2>
    <p class="ri-muted">Latest source check: ${lastRun ? formatDateTime(lastRun.completedAt || lastRun.startedAt) : '—'} · New: ${metrics.newPublications} · Exceptions: ${metrics.processingFailures}</p>
    <p><a href="#/ingestion">Open Ingestion Monitor</a></p>
  </section>`;
}
