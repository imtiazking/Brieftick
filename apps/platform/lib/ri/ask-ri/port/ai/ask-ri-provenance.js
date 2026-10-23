/**
 * Customer-facing Ask RI evidence provenance (presentation only).
 * Internal matchReasons retain full graph edge names for tests/audit.
 */
import { actionIsOverdueAsOf } from './ri-graph-normalized.js';
import { formatAsOfLabel } from './ri-graph-traverse.js';
import { inheritedEvidenceSupportNotes } from './obligation-attribution.js';

const INTERNAL_EDGE_RE =
  /change_links_|_for_|obligation_has_|obligation_supported|action_source|assessment_has|finding_|review_for|evidence_for|evidence_attributed|control_supports|policy_addresses|risk_/i;

function hubDisplayLabel(state, type, id, anchorLabel) {
  if (anchorLabel && !anchorLabel.includes(':')) return anchorLabel;
  if (type === 'Sector') {
    const s = (state.landscapeSectors || []).find((x) => x.id === id);
    return s?.name || id;
  }
  if (type === 'Framework') {
    const f = (state.regulatoryFrameworks || []).find((x) => x.id === id);
    return f?.name || f?.shortName || id;
  }
  if (type === 'Theme') {
    const t = (state.complianceThemes || []).find((x) => x.id === id);
    return t?.name || id;
  }
  if (type === 'Regulator') {
    const r = (state.landscapeRegulators || []).find((x) => x.id === id);
    return r?.shortName || r?.name || id;
  }
  return anchorLabel || id;
}

function nodesFromPath(state, pathSegments) {
  const nodes = [];
  for (const s of pathSegments || []) {
    if (s.kind === 'anchor') {
      nodes.push({
        type: s.type,
        id: s.id,
        label: hubDisplayLabel(state, s.type, s.id, s.label),
      });
    } else if (s.kind === 'node') {
      if (s.type === 'AssuranceFinding') nodes.push({ type: s.type, id: s.id, label: 'Assurance Finding' });
      else if (s.type === 'AssuranceReview') nodes.push({ type: s.type, id: s.id, label: 'Assurance Review' });
      else if (s.type === 'ImpactAssessment') nodes.push({ type: s.type, id: s.id, label: s.id });
      else nodes.push({ type: s.type, id: s.id, label: s.id });
    }
  }
  return nodes;
}

/** First occurrence only — truncate at repeated node to avoid customer-visible cycles. */
/** Customer copy: due date vs query as-of (never use due date as as-of). */
export function formatActionOverdueCustomerCopy(action, asOfDate, asOfLabel) {
  if (!action) return '';
  if (action.status !== 'Overdue' && !actionIsOverdueAsOf(action, asOfDate)) return '';
  const asOf = asOfLabel || (asOfDate ? formatAsOfLabel(asOfDate) : null);
  const dueLabel = action.dueDate ? formatAsOfLabel(action.dueDate) : null;
  if (dueLabel && asOf) return `${action.id} was due on ${dueLabel} and is overdue as of ${asOf}.`;
  if (asOf) return `${action.id} is overdue as of ${asOf}.`;
  return '';
}

export function acyclicNodeChain(nodes) {
  const seen = new Set();
  const out = [];
  for (const n of nodes) {
    const key = `${n.type}:${n.id}`;
    if (seen.has(key)) break;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function formatCustomerProvenanceFromPath(state, pathSegments, recordType, recordId, options = {}) {
  const { asOfDate, asOfLabel } = options;
  let chain = acyclicNodeChain(nodesFromPath(state, pathSegments));
  if (!chain.some((n) => n.id === recordId)) {
    chain.push({
      type: recordType,
      id: recordId,
      label: recordType === 'AssuranceFinding' ? 'Assurance Finding' : recordId,
    });
    chain = acyclicNodeChain(chain);
  }

  const hasObligation = chain.some((n) => n.type === 'Obligation');
  const obligationLinkedTargets = new Set(['Action', 'Evidence', 'Control', 'AssuranceFinding', 'AssuranceReview']);
  let line = chain.map((n) => n.label).join(' → ');

  if (!hasObligation && obligationLinkedTargets.has(recordType) && chain.some((n) => n.type === 'Change')) {
    line += ' — Linked at Change level — not directly to the Obligation';
  }

  if (recordType === 'Action') {
    const action = (state.actions || []).find((a) => a.id === recordId);
    const overdueCopy = formatActionOverdueCustomerCopy(action, asOfDate, asOfLabel);
    if (overdueCopy) line += `. ${overdueCopy}`;
  }

  if (recordType === 'Evidence') {
    const ev = (state.evidence || []).find((e) => e.id === recordId);
    if (ev?.obligationId) {
      const obl = state.obligations?.find((o) => o.id === ev.obligationId);
      const changeId = obl?.changeId;
      const canonical = [];
      if (changeId) canonical.push(changeId);
      canonical.push(ev.obligationId, recordId);
      line = canonical.join(' → ');
      const inherited = inheritedEvidenceSupportNotes(state, ev.obligationId).filter((x) => x.evidenceId === recordId);
      for (const row of inherited) {
        if (row.controlId && row.canonicalObligationId !== ev.obligationId) {
          line += ` — also supported via shared Control ${row.controlId}`;
        }
      }
      if (ev.controlId) {
        const multi = (state.controls || []).find((c) => c.id === ev.controlId);
        const otherObls = (multi?.obligationIds || []).filter((oid) => oid !== ev.obligationId);
        if (otherObls.length) {
          line += ` — also supported via shared Control ${ev.controlId}`;
        }
      }
    }
  }

  return line;
}

/** Parse legacy internal reason strings when path array is unavailable. */
function nodesFromInternalReason(reason) {
  const nodes = [];
  const parts = String(reason || '').split('→').map((p) => p.trim());
  for (const part of parts) {
    if (!part || INTERNAL_EDGE_RE.test(part)) continue;
    const anchor = part.match(/^Anchor\s+(\w+):(.+)$/);
    if (anchor) {
      nodes.push({ type: anchor[1], id: anchor[2], label: anchor[2] });
      continue;
    }
    const node = part.match(/^(\w+):(.+)$/);
    if (node) {
      const type = node[1];
      const id = node[2].replace(/\s*\(.+$/, '').trim();
      nodes.push({
        type,
        id,
        label: type === 'AssuranceFinding' ? 'Assurance Finding' : id,
      });
    }
  }
  return nodes;
}

export function formatCustomerEvidenceReason(state, internalReason, recordId, recordType, options = {}) {
  const { path, asOfDate, asOfLabel } = options;
  if (path?.length) {
    return formatCustomerProvenanceFromPath(state, path, recordType, recordId, { asOfDate, asOfLabel });
  }

  const plain = String(internalReason || '').trim();
  if (plain && !INTERNAL_EDGE_RE.test(plain) && !plain.includes('→')) {
    return plain;
  }

  if (plain.includes('→')) {
    const chain = acyclicNodeChain(nodesFromInternalReason(plain));
    if (chain.length) {
      const syntheticPath = chain.map((n) => ({ kind: 'node', type: n.type, id: n.id }));
      return formatCustomerProvenanceFromPath(state, syntheticPath, recordType, recordId, { asOfDate, asOfLabel });
    }
  }

  if (/OPEN definition/i.test(plain)) {
    return plain.replace('(OPEN definition)', '(open obligations — ACTIVE bucket)');
  }

  return recordId;
}

export function buildDisplayReasons(state, recordIds, recordTypes, matchReasons, options = {}) {
  const { pathByRecordId = {}, asOfDate, asOfLabel } = options;
  const out = {};
  for (const id of recordIds) {
    out[id] = formatCustomerEvidenceReason(state, matchReasons[id], id, recordTypes[id], {
      path: pathByRecordId[id],
      asOfDate,
      asOfLabel,
    });
  }
  return out;
}

export function reasonLooksInternal(reason) {
  return INTERNAL_EDGE_RE.test(String(reason || '')) || String(reason || '').includes('change_links');
}
