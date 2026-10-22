import { directEvidenceIds, supportingEvidenceIds } from './evidence-attribution-parity.mjs';

export const TRACE_FLAGSHIPS = {
  'consumer-duty': {
    publicationId: 'PUB-001',
    changeId: 'CHG-001',
    impactId: 'IA-0042',
    obligationId: 'OBL-0142',
    policyId: 'POL-007',
    riskId: 'RSK-012',
    controlId: 'CTRL-022',
    actionId: 'ACT-018',
    evidenceId: 'EVD-009',
  },
  'op-resilience': {
    publicationId: 'PUB-003',
    changeId: 'CHG-010',
    impactId: 'IA-0038',
    obligationId: 'OBL-0088',
    policyId: 'POL-003',
    riskId: 'RSK-008',
    controlId: 'CTRL-031',
    actionId: 'ACT-031',
    evidenceId: 'EVD-031',
  },
  'third-party': {
    publicationId: 'PUB-002',
    changeId: 'CHG-011',
    impactId: 'IA-0035',
    obligationId: 'OBL-0075',
    policyId: 'POL-012',
    riskId: 'RSK-015',
    controlId: 'CTRL-040',
    actionId: 'ACT-040',
    evidenceId: 'EVD-040',
  },
  'financial-crime': {
    publicationId: 'PUB-004',
    changeId: 'CHG-012',
    impactId: 'IA-0031',
    obligationId: 'OBL-0062',
    policyId: null,
    riskId: 'RSK-019',
    controlId: 'CTRL-052',
    actionId: 'ACT-052',
    evidenceId: 'EVD-052',
  },
};

function get(state, collection, id) {
  return (state[collection] || []).find((x) => x.id === id);
}

export function resolveTraceChainFromLab(state, flagship) {
  const obl = get(state, 'obligations', flagship.obligationId);
  const ch = get(state, 'changes', flagship.changeId);
  const pub = get(state, 'publications', flagship.publicationId);
  const ia = get(state, 'assessments', flagship.impactId);
  const pol = flagship.policyId ? get(state, 'policies', flagship.policyId) : null;
  const risk = get(state, 'risks', flagship.riskId);
  const ctrl = get(state, 'controls', flagship.controlId);
  const act = get(state, 'actions', flagship.actionId);
  const evd = get(state, 'evidence', flagship.evidenceId);
  return {
    publicationId: pub?.id || null,
    changeId: ch?.id || null,
    impactId: ia?.id || null,
    obligationId: obl?.id || null,
    policyId: pol?.id || null,
    riskId: risk?.id || null,
    controlId: ctrl?.id || null,
    actionId: act?.id || null,
    evidenceId: evd?.id || null,
    directEvidence: directEvidenceIds(state, flagship.obligationId),
    supportingEvidence: supportingEvidenceIds(state, flagship.obligationId).map((x) => x.evidenceId),
  };
}

export function compareTraceFlagships(state) {
  const mismatches = [];
  for (const [name, spec] of Object.entries(TRACE_FLAGSHIPS)) {
    const chain = resolveTraceChainFromLab(state, spec);
    const checks = [
      ['publicationId', chain.publicationId],
      ['changeId', chain.changeId],
      ['impactId', chain.impactId],
      ['obligationId', chain.obligationId],
      ['policyId', chain.policyId],
      ['riskId', chain.riskId],
      ['controlId', chain.controlId],
      ['actionId', chain.actionId],
      ['evidenceId', chain.evidenceId],
    ];
    for (const [key, got] of checks) {
      const expected = spec[key];
      if (expected == null) continue;
      if (got !== expected) mismatches.push(`${name}:${key}`);
    }
    if (!chain.directEvidence.includes(spec.evidenceId)) {
      mismatches.push(`${name}:direct-evidence`);
    }
  }
  return { match: mismatches.length === 0, mismatches };
}
