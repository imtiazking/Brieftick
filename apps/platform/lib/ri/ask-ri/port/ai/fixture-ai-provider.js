import { AiProviderAdapter } from './provider-adapter.js';
import { AI_PROVIDER_MODE, AI009_SYNTHETIC_CANARY } from './enums.js';
import { fixtureStructuredForScenario, wrapFixtureResult } from './fixture-scenarios-5b.js';
import { fixtureStructuredForScenario5c, wrapFixtureResult5c } from './fixture-scenarios-5c.js';

export const FIXTURE_AI_PROVIDER_ID = 'AIPROV-FIXTURE-5A';

export class FixtureAiProvider extends AiProviderAdapter {
  constructor() {
    super({ id: FIXTURE_AI_PROVIDER_ID, mode: AI_PROVIDER_MODE.FIXTURE });
  }

  async analyze(request) {
    const scenario = request.fixtureScenario || 'ai-001-summary';
    const ctx = request.contextBundle;
    const pub = ctx?.records?.find((r) => r.recordId === 'PUB-001');
    const pubText = pub?.sourceContent || '';

    if (scenario === 'ai-008-invalid-citation') {
      return {
        ok: true,
        providerMode: AI_PROVIDER_MODE.FIXTURE,
        provider: this.id,
        model: 'fixture-5a',
        structured: {
          summary: 'Invalid citation fixture',
          findings: ['Claim with bad citation'],
          citations: [
            {
              citationKind: 'OFFICIAL_SOURCE',
              sourceRecordId: 'RAW-DOES-NOT-EXIST',
              excerpt: 'This excerpt is definitely long enough to pass minimum length checks here.',
            },
          ],
          keyDates: [],
        },
      };
    }

    const fiveB = fixtureStructuredForScenario(scenario, ctx, this.id);
    if (fiveB) return wrapFixtureResult(this.id, fiveB);

    const fiveC = fixtureStructuredForScenario5c(scenario, ctx, this.id);
    if (fiveC) return wrapFixtureResult5c(this.id, fiveC);

    if (scenario === 'ai-009-injection-compromise') {
      return {
        ok: true,
        providerMode: AI_PROVIDER_MODE.FIXTURE,
        provider: this.id,
        model: 'fixture-5a',
        structured: {
          summary: `<script>alert(1)</script> ${AI009_SYNTHETIC_CANARY}`,
          findings: ['Fabricated regulatory mandate outside scope'],
          injectionCanaryEcho: AI009_SYNTHETIC_CANARY,
          citations: [
            {
              citationKind: 'RI_RECORD',
              recordId: 'PUB-001',
              recordType: 'Publication',
              internalRoute: '#/publications/PUB-001',
              excerpt: pubText.slice(0, 80) || 'FCA Consumer Duty supervisory update PS26/14 publication',
            },
          ],
          keyDates: ['2099-01-01'],
        },
      };
    }

    const norm = (pubText || '').replace(/\s+/g, ' ').trim();
    const excerpt =
      (norm.length >= 20 ? norm.slice(0, Math.min(80, norm.length)) : null) ||
      'FCA Consumer Duty supervisory update PS26/14 requires firms to monitor customer outcomes by cohort.';
    return {
      ok: true,
      providerMode: AI_PROVIDER_MODE.FIXTURE,
      provider: this.id,
      model: 'fixture-5a',
      structured: {
        whatIsThis: 'FCA supervisory update on Consumer Duty outcomes monitoring.',
        whatChanged: 'Strengthened expectations on monitoring and evidencing customer outcomes.',
        whoMayBeAffected: 'FCA-regulated firms with retail customer outcomes obligations.',
        keyDates: ['2027-01-01'],
        keyPoints: ['Outcome monitoring by meaningful cohorts', 'Evidence of customer outcomes'],
        areasRequiringReview: ['MI design', 'Governance reporting'],
        uncertainties: ['Firm-specific implementation scope requires Legal review.'],
        sources: ['PUB-001'],
        summary: 'Supervisory update on Consumer Duty outcome monitoring (fixture).',
        findings: ['Firms must evidence customer outcomes monitoring using meaningful cohorts.'],
        citations: [
          {
            citationKind: 'RI_RECORD',
            recordId: 'PUB-001',
            recordType: 'Publication',
            recordTitle: pub?.recordTitle || 'FCA Consumer Duty supervisory update',
            internalRoute: '#/publications/PUB-001',
            recordVersion: pub?.recordVersion || 'PS26/14',
            excerpt,
          },
        ],
        modelReportedConfidence: 0.82,
      },
    };
  }
}
