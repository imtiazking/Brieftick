/**
 * Connected work-item mutations (impact, obligation, risk, control, evidence, links).
 */
import { notify } from '../store.js';
import { savePersistedJson, STORAGE_KEY_V2 } from './platform-persistence.js';
import { persistableLabState } from './ask-ri-session.mjs';
import {
  fetchConnectedControlDetail,
  fetchConnectedObligationDetail,
  fetchConnectedRiskDetail,
  initConnectedCatalogueState,
  mergeControlCatalogueRow,
  mergeImpactCatalogueRow,
  mergeObligationCatalogueRow,
  mergeRiskCatalogueRow,
  mergeActionCatalogueRow,
  mergeEvidenceCatalogueRow,
  fetchConnectedEvidenceDetail,
  fetchConnectedFindingDetail,
} from './connected-catalogue.js';
import {
  refreshConnectedEntityWorkflowEvents,
} from './connected-entity-audit.js';

function apiBase(state) {
  return (state.platformConfig?.apiBaseUrl || '/api/ri-lab').replace(/\/$/, '');
}

function mergeImpact(cat, assessment) {
  mergeImpactCatalogueRow(cat, assessment);
}

function mergeObligation(cat, obligation) {
  mergeObligationCatalogueRow(cat, obligation);
}

function mergeEvidence(cat, evidence) {
  mergeEvidenceCatalogueRow(cat, evidence);
}

async function refreshConnectedWorkflowEvents(state) {
  const base = apiBase(state);
  const res = await fetch(`${base}/tenant-governance`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) return;
  const cat = initConnectedCatalogueState(state);
  cat.workflowEvents = Array.isArray(body.workflowEvents) ? body.workflowEvents : cat.workflowEvents;
}

function formatConnectedPatchError(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  if (body.error === 'stale_record') return 'Record was updated elsewhere — refresh and save again';
  if (body.error === 'validation_error' && body.detail) return body.detail;
  if (body.error === 'connected_writes_disabled') return 'Connected writes are disabled on staging';
  if (body.error === 'forbidden') return 'Insufficient permission to update this record';
  if (body.error === 'internal_error') {
    return 'The server could not complete this request. Refresh Issues & Actions — if the record appears, do not submit again.';
  }
  if (body.error === 'invalid_entity_type') return 'Workflow audit is not available for this entity type yet';
  return body.detail || body.error || fallback;
}

async function patchEntity(state, path, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatConnectedPatchError(body, 'update_failed'));
  return body;
}

export async function createConnectedImpactAssessment(state, regulatoryChangeId) {
  const base = apiBase(state);
  const res = await fetch(`${base}/impact-assessments`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ regulatoryChangeId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'impact_create_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.assessment) {
    mergeImpact(cat, body.assessment);
    await refreshConnectedEntityWorkflowEvents(state, 'impact_assessment', body.assessment.id);
    const changeId = body.assessment.changeId || regulatoryChangeId;
    if (changeId && cat.changeDetailsById?.[changeId]) {
      const ids = new Set(cat.changeDetailsById[changeId].impactIds || []);
      ids.add(body.assessment.id);
      cat.changeDetailsById[changeId] = {
        ...cat.changeDetailsById[changeId],
        impactIds: [...ids],
      };
    }
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.assessment;
}

export async function patchConnectedImpactAssessment(state, impactId, fields, expectedUpdatedAt = null) {
  const base = apiBase(state);
  const res = await fetch(`${base}/impact-assessments/${encodeURIComponent(impactId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, expectedUpdatedAt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.message || body.error || 'impact_update_failed');
    err.code = body.reason || body.error;
    err.status = res.status;
    throw err;
  }
  const cat = initConnectedCatalogueState(state);
  if (body.assessment) {
    mergeImpact(cat, body.assessment);
    await refreshConnectedEntityWorkflowEvents(state, 'impact_assessment', impactId);
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.assessment;
}

export async function createConnectedObligation(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/obligations`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'obligation_create_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.obligation) {
    mergeObligation(cat, body.obligation);
    const changeId = body.obligation.changeId || payload.regulatoryChangeId;
    if (changeId && cat.changeDetailsById?.[changeId]) {
      const ids = new Set(cat.changeDetailsById[changeId].obligationIds || []);
      ids.add(body.obligation.id);
      cat.changeDetailsById[changeId] = {
        ...cat.changeDetailsById[changeId],
        obligationIds: [...ids],
      };
    }
    await refreshConnectedEntityWorkflowEvents(state, 'regulatory_obligation', body.obligation.id);
    if (payload.regulatoryChangeId) {
      await refreshConnectedEntityWorkflowEvents(state, 'regulatory_change', payload.regulatoryChangeId);
    }
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.obligation;
}

export async function patchConnectedObligation(state, obligationId, fields, expectedUpdatedAt = null) {
  const base = apiBase(state);
  const res = await fetch(`${base}/obligations/${encodeURIComponent(obligationId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, expectedUpdatedAt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'obligation_update_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.obligation) mergeObligation(cat, body.obligation);
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.obligation;
}

function linkAuditEntities(linkType, leftId, rightId) {
  switch (linkType) {
    case 'obligation_risk':
      return [
        ['regulatory_obligation', leftId],
        ['risk', rightId],
      ];
    case 'obligation_control':
      return [
        ['regulatory_obligation', leftId],
        ['control', rightId],
      ];
    case 'risk_control':
      return [
        ['risk', leftId],
        ['control', rightId],
      ];
    case 'evidence_obligation':
      return [
        ['evidence_item', leftId],
        ['regulatory_obligation', rightId],
      ];
    case 'evidence_control':
      return [
        ['evidence_item', leftId],
        ['control', rightId],
      ];
    case 'finding_control':
      return [
        ['finding', leftId],
        ['control', rightId],
      ];
    default:
      return [];
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatConnectedLinkClientError(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  const detail = typeof body.detail === 'string' ? body.detail : '';
  const err = typeof body.error === 'string' ? body.error : '';
  if (err === 'validation_error' && detail) {
    if (detail.includes('left_id') || detail.includes('right_id')) return 'Enter a full record UUID';
    return detail;
  }
  if (err === 'provenance_link_mismatch') return 'Provenance mismatch — link records from the same UAT or operational class';
  if (err === 'forbidden') return 'Insufficient permission to create this link';
  if (err === 'connected_writes_disabled') return 'Connected writes are disabled on staging';
  return detail || err || fallback;
}

export async function postConnectedLink(state, linkType, leftId, rightId) {
  const base = apiBase(state);
  if (!UUID_RE.test(leftId) || !UUID_RE.test(rightId)) {
    throw new Error('Enter a full record UUID');
  }
  const res = await fetch(`${base}/links`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkType, leftId, rightId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatConnectedLinkClientError(body, 'link_failed'));
  const cat = initConnectedCatalogueState(state);
  if (linkType === 'obligation_risk' || linkType === 'obligation_control') {
    delete cat.obligationDetailsById?.[leftId];
    await fetchConnectedObligationDetail(state, leftId).catch(() => null);
  } else if (linkType === 'risk_control') {
    delete cat.riskDetailsById?.[leftId];
    await fetchConnectedRiskDetail(state, leftId).catch(() => null);
    delete cat.controlDetailsById?.[rightId];
    await fetchConnectedControlDetail(state, rightId).catch(() => null);
  } else if (linkType === 'finding_control') {
    delete cat.findingDetailsById?.[leftId];
    await fetchConnectedFindingDetail(state, leftId).catch(() => null);
    delete cat.controlDetailsById?.[rightId];
    await fetchConnectedControlDetail(state, rightId).catch(() => null);
  }
  for (const [etype, eid] of linkAuditEntities(linkType, leftId, rightId)) {
    await refreshConnectedEntityWorkflowEvents(state, etype, eid);
  }
  await refreshConnectedWorkflowEvents(state);
  notify();
  return body;
}

export async function patchConnectedRisk(state, riskId, fields, expectedUpdatedAt = null) {
  const body = await patchEntity(state, `/risks/${encodeURIComponent(riskId)}`, { ...fields, expectedUpdatedAt });
  const cat = initConnectedCatalogueState(state);
  if (body.risk) {
    mergeRiskCatalogueRow(cat, { ...body.risk, _connected: true });
    await refreshConnectedEntityWorkflowEvents(state, 'risk', riskId);
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.risk;
}

export async function createConnectedRisk(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/risks`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof payload === 'string' ? { title: payload } : payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'risk_create_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.risk) {
    mergeRiskCatalogueRow(cat, body.risk);
    await refreshConnectedEntityWorkflowEvents(state, 'risk', body.risk.id);
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.risk;
}

export async function patchConnectedControl(state, controlId, fields, expectedUpdatedAt = null) {
  const body = await patchEntity(state, `/controls/${encodeURIComponent(controlId)}`, {
    ...fields,
    expectedUpdatedAt,
  });
  const cat = initConnectedCatalogueState(state);
  if (body.control) {
    const merged = { ...body.control, _connected: true };
    const prev = cat.controlDetailsById?.[controlId];
    if (prev) {
      if (prev.riskIds && merged.riskIds == null) merged.riskIds = prev.riskIds;
      if (prev.obligationIds && merged.obligationIds == null) merged.obligationIds = prev.obligationIds;
      if (prev.evidenceIds && merged.evidenceIds == null) merged.evidenceIds = prev.evidenceIds;
    }
    mergeControlCatalogueRow(cat, merged);
    await refreshConnectedEntityWorkflowEvents(state, 'control', controlId);
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.control;
}

export async function createConnectedControl(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/controls`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof payload === 'string' ? { name: payload } : payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'control_create_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.control) {
    mergeControlCatalogueRow(cat, body.control);
    await refreshConnectedEntityWorkflowEvents(state, 'control', body.control.id);
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.control;
}

export async function patchConnectedAction(state, actionId, fields, expectedUpdatedAt = null) {
  const body = await patchEntity(state, `/actions/${encodeURIComponent(actionId)}`, {
    ...fields,
    expectedUpdatedAt,
  });
  const cat = initConnectedCatalogueState(state);
  if (body.action) {
    const merged = { ...body.action, _connected: true };
    mergeActionCatalogueRow(cat, merged);
    await refreshConnectedEntityWorkflowEvents(state, 'action', actionId);
  }
  try {
    await refreshConnectedWorkflowEvents(state);
  } catch (govErr) {
    console.warn('[ri-lab] governance refresh failed after action create', govErr?.message || govErr);
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.action;
}

export async function createConnectedAction(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/actions`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatConnectedPatchError(body, body.error || 'action_create_failed'));
  const cat = initConnectedCatalogueState(state);
  if (body.action) {
    mergeActionCatalogueRow(cat, body.action);
    try {
      await refreshConnectedEntityWorkflowEvents(state, 'action', body.action.id);
    } catch (auditErr) {
      console.warn('[ri-lab] action entity audit refresh failed after create', auditErr?.message || auditErr);
    }
  }
  try {
    await refreshConnectedWorkflowEvents(state);
  } catch (govErr) {
    console.warn('[ri-lab] governance refresh failed after action create', govErr?.message || govErr);
  }
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.action;
}

export async function createConnectedEvidence(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/evidence`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'evidence_create_failed');
  const cat = initConnectedCatalogueState(state);
  if (body.evidence) {
    mergeEvidence(cat, body.evidence);
    try {
      await refreshConnectedEntityWorkflowEvents(state, 'evidence_item', body.evidence.id);
    } catch (auditErr) {
      console.warn('[ri-lab] evidence entity audit refresh failed after create', auditErr?.message || auditErr);
    }
  }
  await refreshConnectedWorkflowEvents(state);
  savePersistedJson(STORAGE_KEY_V2, persistableLabState(state));
  notify();
  return body.evidence;
}

export async function patchConnectedPublicationApplicability(state, publicationId, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/publications/${encodeURIComponent(publicationId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'applicability_save_failed');
  await refreshConnectedWorkflowEvents(state);
  notify();
  return body;
}

export async function patchConnectedApplicabilityWorkflow(state, assessmentId, payload) {
  const body = await patchEntity(state, `/applicability/${encodeURIComponent(assessmentId)}`, payload);
  await refreshConnectedWorkflowEvents(state);
  notify();
  return body.assessment;
}

export async function fetchConnectedGovernancePending(state) {
  const base = apiBase(state);
  const res = await fetch(`${base}/governance/pending`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'governance_pending_unavailable');
  return body.pending || [];
}

const EVIDENCE_UPLOAD_ERROR_MESSAGES = {
  evidence_duplicate_content:
    'This file matches the latest version (duplicate content). Change the file content before uploading again.',
  evidence_invalid_content_type: 'Unsupported file type. Use PDF, PNG, JPEG, or TXT.',
  evidence_invalid_size: 'File must be non-empty and under 5MB.',
  evidence_no_file: 'No file is attached to this evidence yet.',
  missing_file: 'Choose a file before uploading.',
  internal_error: 'Upload failed due to a server error.',
  forbidden: 'You do not have permission to upload evidence.',
  connected_writes_disabled: 'Evidence uploads are disabled in this session.',
};

export function formatEvidenceUploadError(body) {
  const code = body?.error;
  if (code && EVIDENCE_UPLOAD_ERROR_MESSAGES[code]) return EVIDENCE_UPLOAD_ERROR_MESSAGES[code];
  if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
  return code || 'Evidence upload failed';
}

export async function uploadConnectedEvidenceFile(state, evidenceId, file) {
  const base = apiBase(state);
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${base}/evidence/${encodeURIComponent(evidenceId)}/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatEvidenceUploadError(body));
  try {
    await refreshConnectedEntityWorkflowEvents(state, 'evidence_item', evidenceId);
  } catch (refreshErr) {
    console.warn('[connected] evidence upload workflow refresh failed', refreshErr);
  }
  try {
    await fetchConnectedEvidenceDetail(state, evidenceId);
  } catch (refreshErr) {
    console.warn('[connected] evidence upload detail refresh failed', refreshErr);
  }
  notify();
  return body.version;
}

const EVIDENCE_FILE_ERROR_MESSAGES = {
  evidence_version_not_found: 'That evidence version was not found.',
  evidence_preview_unavailable: 'This file cannot be previewed in the browser. Use Download instead.',
  evidence_download_unavailable: 'Download is not available for this version.',
  evidence_no_file: 'No file is attached to this evidence yet.',
  forbidden: 'You do not have permission to access this file.',
  unauthorized: 'Sign in again to access evidence files.',
};

export function formatEvidenceFileAccessError(body) {
  const code = body?.error;
  if (code && EVIDENCE_FILE_ERROR_MESSAGES[code]) return EVIDENCE_FILE_ERROR_MESSAGES[code];
  if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
  return code || 'Evidence file access failed';
}

export async function fetchConnectedEvidenceDownloadUrl(state, evidenceId) {
  const base = apiBase(state);
  const res = await fetch(`${base}/evidence/${encodeURIComponent(evidenceId)}/download`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(formatEvidenceFileAccessError(body));
  return body;
}

/** @type {Map<string, Promise<unknown>>} */
const evidenceFileInflight = new Map();

function evidenceFileInflightKey(kind, evidenceId, versionNumber) {
  return `${kind}:${evidenceId}:${versionNumber}`;
}

async function withEvidenceFileInflight(key, fn) {
  if (evidenceFileInflight.has(key)) return evidenceFileInflight.get(key);
  const p = fn().finally(() => evidenceFileInflight.delete(key));
  evidenceFileInflight.set(key, p);
  return p;
}

export async function previewConnectedEvidenceVersion(state, evidenceId, versionNumber) {
  const base = apiBase(state);
  const key = evidenceFileInflightKey('preview', evidenceId, versionNumber);
  return withEvidenceFileInflight(key, async () => {
    const res = await fetch(
      `${base}/evidence/${encodeURIComponent(evidenceId)}/versions/${encodeURIComponent(String(versionNumber))}/access?intent=preview`,
      { credentials: 'same-origin', headers: { Accept: 'application/json' } },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) throw new Error(formatEvidenceFileAccessError(body));
    if (!body.signedUrl) throw new Error('Preview link unavailable');
    return body;
  });
}

function parseContentDispositionFilename(header) {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain?.[1] || null;
}

export async function downloadConnectedEvidenceVersion(state, evidenceId, versionNumber, filenameHint) {
  const base = apiBase(state);
  const key = evidenceFileInflightKey('download', evidenceId, versionNumber);
  return withEvidenceFileInflight(key, async () => {
    const res = await fetch(
      `${base}/evidence/${encodeURIComponent(evidenceId)}/versions/${encodeURIComponent(String(versionNumber))}/content?disposition=attachment`,
      { credentials: 'same-origin' },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(formatEvidenceFileAccessError(body));
    }
    const blob = await res.blob();
    const filename =
      parseContentDispositionFilename(res.headers.get('Content-Disposition')) || filenameHint || 'evidence-file';
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    return { filename, bytes: blob.size };
  });
}

export async function createConnectedAssuranceReview(state, payload) {
  const base = apiBase(state);
  const res = await fetch(`${base}/assurance-reviews`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_type: payload.review_type,
      result: payload.result,
      notes: payload.notes || null,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || 'assurance_create_failed');
  if (payload.controlId && body.assuranceReview?.id) {
    await postConnectedLink(state, 'assurance_control', body.assuranceReview.id, payload.controlId);
  }
  await refreshConnectedWorkflowEvents(state);
  notify();
  return body.assuranceReview;
}
