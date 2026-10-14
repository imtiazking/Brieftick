import { AI_PROVIDER_MODE } from './enums.js';

function citeRi(recordId, recordType, excerpt, route) {
  return {
    citationKind: 'RI_RECORD',
    recordId,
    recordType,
    internalRoute: route,
    excerpt: excerpt.length >= 20 ? excerpt : `${excerpt} — supporting RI record context for citation.`,
  };
}

function citeFromCtx(ctx, recordId, recordType, route) {
  const r = ctx?.records?.find((x) => x.recordId === recordId);
  const raw = (r?.sourceContent || '').replace(/\s+/g, ' ').trim();
  const excerpt = raw.length >= 20 ? raw.slice(0, Math.min(90, raw.length)) : `Record ${recordId} in retrieved RI context for Design Lab citation.`;
  return citeRi(recordId, recordType, excerpt, route);
}

export function fixtureStructuredForScenario5c(scenario, ctx, providerId) {
  const records = ctx?.records || [];
  const firstChange = records.find((r) => r.recordType === 'Change') || records[0];
  const chgId = firstChange?.recordId || 'CHG-001';
  const pub = records.find((r) => r.recordType === 'Publication');
  const pubExcerpt =
    pub?.sourceContent?.slice(0, 80) ||
    'FCA Consumer Duty supervisory update PS26/14 requires firms to monitor customer outcomes by cohort.';

  if (scenario === 'ai-006-ask-banking') {
    return {
      answer:
        'AI SYNTHESIS: Several regulatory Changes in the demo corpus affect Banking, primarily via Consumer Duty and prudential oversight themes.',
      keyFindings: ['Consumer Duty outcome monitoring remains active', 'Governance expectations under PS26/14'],
      affectedSectors: ['Banking'],
      affectedFrameworks: ['PRA Rulebook', 'UK CRR'],
      relatedChanges: [chgId],
      relatedObligations: [],
      openItems: ['Impact assessments may remain open for medium-materiality changes'],
      uncertainties: ['Applicability to specific legal entities requires human confirmation'],
      factTypes: { answer: 'AI_SYNTHESIS', keyFindings: 'AI_SYNTHESIS' },
      citations: [citeFromCtx(ctx, chgId, 'Change', `#/change/${chgId}`)],
      deterministicFactsEcho: ctx?.deterministicFacts || {},
    };
  }

  if (scenario === 'ai-020-retrieval-boundary') {
    return {
      answer: 'Should fail validation',
      uncertainties: ['Test scenario'],
      citations: [
        citeRi('CHG-D-NOT-IN-CONTEXT', 'Change', 'Fabricated citation to record outside retrieval boundary test.', '#/change/CHG-D-NOT-IN-CONTEXT'),
      ],
    };
  }

  if (scenario === 'ai-007-text-comparison') {
    const diff = ctx?.deterministicDiff || { added: [], removed: [], changed: [] };
    return {
      interpretationSummary: 'AI SYNTHESIS: Amendments strengthen customer communication expectations during incidents.',
      potentialSignificance: ['Additional explicit communication requirement'],
      possibleAffectedAreas: ['Operational resilience', 'Customer communications'],
      uncertainties: ['Final legal interpretation requires compliance review'],
      deterministicDiff: diff,
      citations: [
        {
          citationKind: 'OFFICIAL_SOURCE',
          sourceRecordId: 'FIXTURE-PS24',
          excerpt: 'Firms must communicate clearly with customers during operational incidents affecting material services.',
          canonicalUrl: 'https://www.fca.org.uk/publications/policy/ps24-1',
        },
      ],
    };
  }

  if (scenario === 'ai-005-implementation-mapping') {
    const reviewed = ctx?.reviewedMapping;
    return {
      sourceA: 'BAS-TGT-OPE',
      sourceB: 'PUB-003',
      suggestedRelationship: reviewed?.mappingId || 'RELATED_IMPLEMENTATION',
      mappingType: 'RELATED_IMPLEMENTATION',
      relationshipLabel: reviewed ? 'REVIEWED MAPPING' : 'CANDIDATE MAPPING',
      preferReviewedMappingId: reviewed?.mappingId || null,
      reason: reviewed
        ? 'Uses existing human-reviewed Basel→PRA implementation mapping as authoritative RI relationship.'
        : 'Would be candidate only if no reviewed mapping existed',
      uncertainties: ['Basel standards are not UK law; PRA implementation is separate'],
      evidenceConfidence: 'MEDIUM',
      citations: [
        citeFromCtx(ctx, 'BAS-TGT-OPE', 'Publication', '#/basel/BAS-TGT-OPE'),
        citeFromCtx(ctx, 'PUB-003', 'Publication', '#/publication/PUB-003'),
      ],
    };
  }

  if (scenario === 'ai-022-board-summary') {
    return {
      summaryType: 'BOARD_REGULATORY_SUMMARY',
      reportingPeriod: ctx?.reportingPeriod || '2026-Q3',
      materialDevelopments: ['Consumer Duty PS26/14 implementation progressing'],
      businessImpact: ['Retail banking conduct monitoring'],
      deliveryStatus: ['Open impact assessments on medium materiality changes'],
      majorRiskControlIssues: ['See linked assurance findings in RI state'],
      overdueHighRiskItems: ['Actions past due in demo corpus'],
      managementDecisions: ['Confirm IA completion for high materiality changes'],
      uncertainties: ['Board summary is AI draft only'],
      citations: [citeFromCtx(ctx, 'CHG-001', 'Change', '#/change/CHG-001')],
      deterministicFactsEcho: ctx?.deterministicFacts || {},
    };
  }

  if (scenario === 'ai-021-basel-ask') {
    const reviewed = ctx?.reviewedMapping || ctx?.retrieval?.filters;
    const mappingId = ctx?.reviewedMapping?.mappingId || 'BAS-MAP-TRACE-001';
    return {
      answer: `AI SYNTHESIS: Basel operational risk developments trace to UK PRA material via reviewed mapping ${mappingId}. Basel is not UK law.`,
      keyFindings: [`Authoritative RI relationship: REVIEWED mapping ${mappingId}`],
      uncertainties: ['National implementation may differ from BCBS wording'],
      citations: [
        citeFromCtx(ctx, 'BAS-TGT-OPE', 'Publication', '#/basel/BAS-TGT-OPE'),
        citeFromCtx(ctx, 'PUB-003', 'Publication', '#/publication/PUB-003'),
      ],
      reviewedMappingId: mappingId,
    };
  }

  if (scenario === 'ai-019-count-obligations') {
    const count = ctx?.deterministicFacts?.openObligationCount ?? 0;
    return {
      answer: `AI SYNTHESIS: RI reports ${count} open obligations in the current demo portfolio (deterministic count).`,
      keyFindings: [`Open obligation count (RI): ${count}`],
      uncertainties: ['Status filters use Design Lab obligation workflow states'],
      citations: records.slice(0, 1).map((r) => citeFromCtx(ctx, r.recordId, r.recordType, r.internalRoute || '#/obligations')),
      deterministicFactsEcho: ctx?.deterministicFacts || {},
      openObligationCount: count,
    };
  }

  return null;
}

export function wrapFixtureResult5c(providerId, structured) {
  return {
    ok: true,
    providerMode: AI_PROVIDER_MODE.FIXTURE,
    provider: providerId,
    model: 'fixture-5c',
    structured,
  };
}
