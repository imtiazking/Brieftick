import { getOrgFactor } from '../ai-governance-helpers.js';

const DEFAULT_BUDGET = {
  maxSections: 8,
  maxChars: 12000,
  maxOrgFactors: 6,
};

export function buildAiContext(state, request, budget = DEFAULT_BUDGET) {
  const sectionIds = request.sourceSectionIds || [];
  const sections = sectionIds
    .map((id) => state.sourceSections?.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => {
      const doc = state.sourceDocumentCatalog?.find((d) => d.id === s.documentId);
      const src = state.regulatorySources?.find((r) => r.id === doc?.sourceId);
      return {
        sourceSectionId: s.id,
        sourceDocumentId: s.documentId,
        citation: s.citation,
        text: s.text,
        trustLevel: src?.sourceTrust || doc?.sourceTrust || 'Unverified',
        dataOrigin: doc?.dataOrigin || 'demo',
        documentVersion: doc?.documentVersion,
        relevanceScore: 1,
        untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
      };
    });

  const orgVersion = request.organisationProfileVersion || state.orgProfile?.version || 'ORG-DEMO-05';
  const orgRec = (state.organisationProfileVersions || []).find((v) => v.id === orgVersion);
  const factorIds = (orgRec?.factorIds || []).slice(0, budget.maxOrgFactors);
  const orgFactors = factorIds.map((id) => getOrgFactor(state, id)).filter(Boolean);

  let truncated = false;
  let selected = sections.slice(0, budget.maxSections);
  if (sections.length > budget.maxSections) truncated = true;

  let charCount = selected.reduce((n, s) => n + (s.text?.length || 0), 0);
  while (charCount > budget.maxChars && selected.length > 1) {
    selected = selected.slice(0, -1);
    truncated = true;
    charCount = selected.reduce((n, s) => n + (s.text?.length || 0), 0);
  }

  return {
    organisationProfileVersion: orgVersion,
    organisationFactors: orgFactors,
    sourceSections: selected,
    contextTruncated: truncated,
    omittedSectionCount: Math.max(0, sections.length - selected.length),
    allowedSectionIds: selected.map((s) => s.sourceSectionId),
  };
}

export function retrieveContextForEntity(state, entityType, entityId) {
  if (entityType === 'Regulatory Change') {
    const ch = state.changes?.find((c) => c.id === entityId);
    if (ch?.sourceSectionId) return { sourceSectionIds: [ch.sourceSectionId] };
    const pub = state.publications?.find((p) => p.id === ch?.publicationId);
    if (pub?.sourceDocumentIds?.length) {
      const secs = (state.sourceSections || []).filter((s) => pub.sourceDocumentIds.includes(s.documentId)).map((s) => s.id);
      return { sourceSectionIds: secs.slice(0, 5) };
    }
  }
  if (entityType === 'Publication') {
    const pub = state.publications?.find((p) => p.id === entityId);
    const docIds = pub?.sourceDocumentIds || (pub?.sourceDocumentId ? [pub.sourceDocumentId] : []);
    const secs = (state.sourceSections || []).filter((s) => docIds.includes(s.documentId)).map((s) => s.id);
    return { sourceSectionIds: secs.slice(0, 5) };
  }
  return { sourceSectionIds: [] };
}
