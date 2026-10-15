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

  if (scenario === 'ai-obligation-predicate') {
    const pr = ctx?.deterministicFacts?.predicateResult || {};
    const ids = pr.qualifyingIds || [];
    const label = pr.anchorLabel || 'matching';
    const targetType = pr.targetType || 'Obligation';
    const req = pr.requiredRelationships || [];
    const excl = pr.excludedRelationships || [];
    const targetWord = targetType === 'Change' ? 'changes' : 'obligations';

    let answer;
    if (ids.length === 0) {
      answer = `No ${label} ${targetWord} meet this criterion in the current RI dataset.`;
    } else if (targetType === 'Change' && excl.some((e) => e.type === 'ImpactAssessment')) {
      const joined = ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
      answer =
        ids.length === 1
          ? `1 regulatory change has no impact assessment: ${joined}.`
          : `${ids.length} regulatory changes have no impact assessment: ${joined}.`;
    } else if (req.some((r) => r.type === 'Evidence') && excl.some((e) => e.type === 'AssuranceFinding')) {
      const joined = ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
      answer = `${ids.length} ${label} obligations have qualifying evidence and no attributable assurance findings: ${joined}.`;
    } else if (excl.some((e) => e.type === 'Evidence' && e.maximum === 0)) {
      const joined = ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
      answer =
        ids.length === 1
          ? `1 ${label} obligation has no attributable evidence: ${joined}.`
          : `${ids.length} ${label} obligations have no attributable evidence: ${joined}.`;
    } else if (req.some((r) => r.type === 'Evidence') && req.some((r) => r.type === 'AssuranceFinding')) {
      const joined = ids.join(', ');
      answer = `${ids.length} ${label} obligations have attributable evidence and assurance findings: ${joined}.`;
    } else {
      answer = `${ids.length} ${label} ${targetWord} match the requested relationship predicate: ${ids.join(', ')}.`;
    }

    return {
      answer,
      keyFindings: ids.map((id) => `Qualifying ${targetType} ${id} per deterministic predicate evaluation.`),
      relatedObligations: targetType === 'Obligation' ? ids : [],
      relatedChanges: targetType === 'Change' ? ids : [],
      relatedActions: [],
      uncertainties: ['Human review required'],
      factTypes: { answer: 'DETERMINISTIC_PREDICATE', keyFindings: 'DETERMINISTIC_PREDICATE' },
      citations: records.slice(0, 5).map((r) =>
        citeFromCtx(ctx, r.recordId, r.recordType, r.internalRoute || `#/change/${r.recordId}`)
      ),
      deterministicFactsEcho: ctx?.deterministicFacts || {},
    };
  }

  if (scenario === 'ai-006-deterministic-ask') {
    const retrieval = ctx?.retrieval || {};
    const byType = {};
    for (const id of retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []) {
      const t = retrieval.recordTypes?.[id] || 'Record';
      byType[t] = (byType[t] || 0) + 1;
    }
    const parts = Object.entries(byType)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, n]) => `${n} ${t}(s)`);
    const summary = parts.length ? parts.join('; ') : 'No RI records in retrieval scope.';
    const changeIds = (retrieval.matchedRecordIdsAll || retrieval.matchedRecordIds || []).filter(
      (id) => retrieval.recordTypes?.[id] === 'Change'
    );
    return {
      answer: `AI SYNTHESIS: Deterministic retrieval returned ${retrieval.totalMatchingRecords ?? retrieval.resultCount ?? 0} record(s): ${summary}.`,
      keyFindings: parts.length ? parts.map((p) => `Retrieved ${p}.`) : ['No qualifying records in retrieval boundary.'],
      relatedChanges: changeIds,
      relatedObligations: (retrieval.matchedRecordIdsAll || []).filter((id) => retrieval.recordTypes?.[id] === 'Obligation'),
      relatedActions: (retrieval.matchedRecordIdsAll || []).filter((id) => retrieval.recordTypes?.[id] === 'Action'),
      uncertainties: ['Human review required'],
      factTypes: { answer: 'AI_SYNTHESIS', keyFindings: 'AI_SYNTHESIS' },
      citations: records.slice(0, 5).map((r) => citeFromCtx(ctx, r.recordId, r.recordType, r.internalRoute || `#/change/${r.recordId}`)),
      deterministicFactsEcho: ctx?.deterministicFacts || {},
    };
  }

  if (scenario === 'ai-006-compound-ask') {
    const ec = ctx?.retrieval?.evaluatedCounts || {};
    const gaps = ctx?.retrieval?.secondaryGaps || [];
    const changeCount = ctx?.retrieval?.primaryResultCount ?? 0;
    const actionCount = ec.Action?.evaluated ? ec.Action.count : null;
    const oblCount = ec.Obligation?.evaluated ? ec.Obligation.count : null;
    const controlCount = ec.Control?.evaluated ? ec.Control.count : null;
    const actionStatuses = ctx?.deterministicFacts?.linkedActionStatuses || [];
    const statusLine =
      actionStatuses.length > 0
        ? `Action statuses from RI: ${actionStatuses.map((a) => `${a.actionId}=${a.status}`).join(', ')}.`
        : '';
    const openOblGap = gaps.includes('linked-open-obligations');
    const countParts = [`${changeCount} primary Change record(s)`];
    if (actionCount != null) countParts.push(`${actionCount} linked Action(s)`);
    if (oblCount != null) countParts.push(`${oblCount} linked Obligation(s)`);
    if (controlCount != null) countParts.push(`${controlCount} linked Control(s)`);
    return {
      answer: `AI SYNTHESIS: RI contains ${countParts.join('; ')} for the resolved graph anchor. ${statusLine}${
        openOblGap ? ' No active + in-review obligations were found in RI.' : ''
      }`.trim(),
      keyFindings: [
        `Primary Changes retrieved: ${changeCount}`,
        actionCount == null
          ? null
          : actionCount === 0
            ? gaps.includes('linked-actions')
              ? 'No linked Action records are recorded for these Changes in RI.'
              : `Linked Actions evaluated: ${actionCount}`
            : `Linked Actions retrieved: ${actionCount}`,
        oblCount == null
          ? null
          : oblCount === 0 && openOblGap
            ? 'No active + in-review obligations were found in RI.'
            : oblCount > 0
              ? `Active + in-review Obligations retrieved: ${oblCount}`
              : `Linked Obligations evaluated: ${oblCount}`,
        controlCount != null && controlCount > 0 ? `Linked Controls retrieved: ${controlCount}` : null,
        statusLine || null,
      ].filter(Boolean),
      relatedChanges: records.filter((r) => r.recordType === 'Change').map((r) => r.recordId),
      relatedObligations: records.filter((r) => r.recordType === 'Obligation').map((r) => r.recordId),
      relatedActions: records.filter((r) => r.recordType === 'Action').map((r) => r.recordId),
      uncertainties: gaps.length ? [`RI has no records for secondary request(s): ${gaps.join(', ')}`] : ['Human review required'],
      factTypes: { answer: 'AI_SYNTHESIS', keyFindings: 'AI_SYNTHESIS' },
      citations: records.slice(0, 3).map((r) => citeFromCtx(ctx, r.recordId, r.recordType, r.internalRoute || `#/change/${r.recordId}`)),
      deterministicFactsEcho: ctx?.deterministicFacts || {},
      compoundEcho: { changeCount, actionCount, secondaryGaps: gaps },
    };
  }

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
    const open = ctx?.deterministicFacts?.openObligationCount ?? 0;
    const draft = ctx?.deterministicFacts?.draftObligationCount ?? 0;
    const overdue = ctx?.deterministicFacts?.overdueActiveCount ?? 0;
    const inReview = ctx?.deterministicFacts?.reviewObligationCount ?? 0;
    const unclassified = ctx?.deterministicFacts?.unclassifiedObligationStatuses || [];
    const unclassifiedLine =
      unclassified.length > 0
        ? ` Unclassified obligation statuses for review: ${unclassified.map((u) => `${u.status} (${u.count})`).join(', ')}.`
        : '';
    const overdueLine = overdue > 0 ? ` ${overdue} of those active obligations are overdue.` : '';
    return {
      answer: `AI SYNTHESIS: RI reports ${open} active (open) and ${draft} draft obligations; ${inReview} in governance review.${overdueLine} Draft proposals are not counted as open.${unclassifiedLine}`,
      keyFindings: [
        `Active (open) obligation count (RI): ${open}`,
        `Draft obligation count (RI): ${draft}`,
        `In review: ${inReview}`,
      ],
      uncertainties: ['Open obligations = ACTIVE only; compound linked counts use Active + in-review (see docs/AI-REGULATORY-INTELLIGENCE.md)'],
      citations: records.slice(0, 1).map((r) => citeFromCtx(ctx, r.recordId, r.recordType, r.internalRoute || '#/obligations')),
      deterministicFactsEcho: ctx?.deterministicFacts || {},
      openObligationCount: open,
      draftObligationCount: draft,
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
