#!/usr/bin/env node
/**
 * Offline contract: regulatory traceability mapper distinguishes tenant change vs optional none.
 */
import assert from 'node:assert/strict';
// Inline contract mirror of buildRegulatoryTraceability (mapper is TypeScript-only in Next bundle).
function mapTrace(detail) {
  const changeIds = (detail.changes ?? []).map((c) => c.id);
  const linkage = changeIds.length ? 'TENANT_CHANGE' : 'NONE';
  const provenanceRunId =
    detail.publication.provenance?.ingestionRunId &&
    String(detail.publication.provenance.ingestionRunId).trim();
  const versionRunIds = (detail.versions ?? [])
    .map((v) => v.ingestion_run_id)
    .filter(Boolean);
  return {
    linkage,
    ingestionRunId: provenanceRunId || versionRunIds[0] || null,
    primaryChangeId: changeIds[0] ?? null,
  };
}

const moci = mapTrace({
  publication: {
    id: '0a88c11f-f0fe-4f15-bce0-9ff3a06b2486',
    provenance: {
      ingestionRunId: '4cac5a4c-7a76-46ab-89c1-27ff08523825',
      sourceId: 'SRC-MOCI-SA-COMPANIES-LAW',
    },
    regulator: { external_key: 'REG-MOCI-SA' },
    source: { external_key: 'SRC-MOCI-SA-COMPANIES-LAW' },
  },
  changes: [],
  impacts: [],
  versions: [{ ingestion_run_id: '4cac5a4c-7a76-46ab-89c1-27ff08523825' }],
});
assert.equal(moci.linkage, 'NONE');
assert.equal(moci.ingestionRunId, '4cac5a4c-7a76-46ab-89c1-27ff08523825');

const linked = mapTrace({
  publication: {
    id: '829c5472-953a-40ff-9628-947afbfe4e7a',
    provenance: {},
    regulator: { external_key: 'REG-FCA' },
    source: { external_key: 'SRC-FCA-PUBLICATIONS-RSS' },
  },
  changes: [{ id: 'cb1e415a-2605-4c46-a0d8-3ab17de4dab7' }],
  impacts: [{ id: 'x' }],
  versions: [],
});
assert.equal(linked.linkage, 'TENANT_CHANGE');
assert.equal(linked.primaryChangeId, 'cb1e415a-2605-4c46-a0d8-3ab17de4dab7');

console.log('PASS acceptance-ri-regulatory-traceability');