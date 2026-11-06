import { AI_PROVIDER_MODE } from './enums.js';

export function pubExcerpt(pub) {
  const pubText = pub?.sourceContent || '';
  const norm = pubText.replace(/\s+/g, ' ').trim();
  return (
    (norm.length >= 20 ? norm.slice(0, Math.min(80, norm.length)) : null) ||
    'FCA Consumer Duty supervisory update PS26/14 requires firms to monitor customer outcomes by cohort.'
  );
}

export function fixtureStructuredForScenario(scenario, ctx, providerId) {
  const pub = ctx?.records?.find((r) => r.recordType === 'Publication') || ctx?.records?.find((r) => r.recordId?.startsWith('PUB-'));
  const pubId = pub?.recordId || 'PUB-001';
  const excerpt = pubExcerpt(pub);
  const baseCitation = {
    citationKind: 'RI_RECORD',
    recordId: pubId,
    recordType: 'Publication',
    internalRoute: `#/publications/${pubId}`,
    excerpt,
  };

  if (scenario === 'ai-014-unknown-policy') {
    return {
      summary: 'Policy impact with invalid ID',
      impactSummary: 'Invalid policy reference test',
      policyImpacts: [{ policyId: 'POL-DOES-NOT-EXIST', title: 'Bad', potentialImpact: 'High', reason: 'Test', citations: [baseCitation] }],
      uncertainties: ['Fixture uncertainty'],
      citations: [baseCitation],
    };
  }

  if (scenario === 'ai-015-unsupported-deadline') {
    return {
      summary: 'Change with invented deadline',
      materialitySuggestion: 'REQUIRES REVIEW',
      proposedChangeDraft: { title: 'Bad deadline change', summary: 'Test' },
      keyDates: ['2099-12-31'],
      uncertainties: ['Fixture uncertainty'],
      citations: [baseCitation],
    };
  }

  if (scenario === 'ai-002-change-analysis') {
    return {
      summary: 'Potential Consumer Duty monitoring change identified from publication.',
      materialitySuggestion: 'LIKELY MATERIAL CHANGE',
      proposedChangeDraft: {
        title: 'Consumer Duty outcome monitoring uplift (AI draft)',
        summary: 'Strengthen cohort-based outcome monitoring and evidence (fixture).',
        changeType: 'Supervisory expectation',
        effectiveDateCandidate: '2027-01-01',
      },
      sectorMappings: [{ sectorId: 'SEC-006', reason: 'Consumer credit exposure', evidenceConfidence: 'HIGH' }],
      frameworkMappings: [{ frameworkId: 'FWK-CONSUMER-DUTY', reason: 'Consumer Duty framework', evidenceConfidence: 'HIGH' }],
      themeMappings: [{ themeId: 'THM-CONSUMER', reason: 'Consumer protection theme' }],
      keyDates: ['2027-01-01'],
      uncertainties: ['Firm-specific product scope requires review.'],
      questionsForReviewer: ['Which product lines are in scope for cohort MI?'],
      citations: [baseCitation],
    };
  }

  if (scenario === 'ai-003-impact-assessment') {
    return {
      summary: 'Synthetic organisation may need enhanced Consumer Duty MI and governance.',
      impactSummary: 'Retail banking and conduct units likely affected.',
      applicabilityQuestions: ['Does current MI cover vulnerable cohorts?'],
      affectedBusinessAreas: ['Retail Banking', 'Conduct'],
      affectedProducts: ['Current accounts', 'Savings'],
      affectedProcesses: ['MI production', 'Board reporting'],
      policyImpacts: [{ policyId: 'POL-007', title: 'Consumer Duty Monitoring Policy', potentialImpact: 'Update monitoring standards', reason: 'Aligned to PS26/14', citations: [baseCitation] }],
      riskImpacts: [{ riskId: 'RSK-012', potentialImpact: 'Increased conduct risk if MI gaps remain', reason: 'Outcome monitoring', citations: [baseCitation] }],
      controlImpacts: [{ controlId: 'CTRL-022', potentialImpact: 'Control design may need enhancement', reason: 'Monitoring control', citations: [baseCitation] }],
      potentialObligationAreas: ['Customer outcome evidence'],
      implementationConsiderations: ['Data lineage for cohort tags'],
      deadlines: ['2027-01-01'],
      dependencies: ['POL-007 review'],
      openQuestions: ['Committee cadence for challenge?'],
      uncertainties: ['Exact cohort definitions require business input.'],
      citations: [baseCitation],
    };
  }

  if (scenario === 'ai-004-obligation-suggestion') {
    return {
      summary: 'Suggested obligations from IA context (fixture).',
      obligationSuggestions: [
        {
          suggestedTitle: 'Evidence customer outcomes by cohort (AI suggestion)',
          suggestedText: 'The firm must maintain evidence of customer outcomes segmented by meaningful cohorts including vulnerable customers.',
          effectiveDateCandidate: '2027-01-01',
          reason: 'Derived from supervisory update',
          uncertainties: ['Legal wording requires Compliance review.'],
          citations: [baseCitation],
        },
      ],
      uncertainties: ['Obligation scope requires Legal sign-off.'],
      citations: [baseCitation],
    };
  }

  return null;
}

export function wrapFixtureResult(providerId, structured) {
  return {
    ok: true,
    providerMode: AI_PROVIDER_MODE.FIXTURE,
    provider: providerId,
    model: 'fixture-5b',
    structured,
  };
}
