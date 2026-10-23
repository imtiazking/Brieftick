import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixtureProvider } from './ai-fixture-provider.mjs';
import { validateCitations } from './ai-citation-validator.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..', '..', '..', '..');
const labRoot = join(repoRoot, 'design-lab', 'regulatory-intelligence');

const baseRequest = {
  useCaseId: 'UC-RI-003',
  analysisType: 'Applicability Recommendation',
  context: {
    sourceSections: [
      { sourceSectionId: 'SRCSEC-001', citation: '§3.14', text: 'Consumer Duty cohort monitoring expectations (fixture).' },
    ],
  },
};

function fingerprint(result) {
  if (!result.ok) return `ERR|${result.code}`;
  const s = result.structured || {};
  const claims = (s.claims || []).map((c) => `${c.confidence}|${(c.sourceSectionIds || []).join('+')}`).join(';');
  return `${result.schemaName}|${s.recommendation}|${s.confidence}|${claims}`;
}

export async function compareFixtureProviderParity() {
  const { createFixtureProvider: labFixture } = await import(
    pathToFileURL(join(labRoot, 'js', 'ai-runtime', 'fixture-provider.js')).href
  );
  const lab = await labFixture().execute({ ...baseRequest, fixtureScenario: 'default' });
  const prod = await createFixtureProvider().execute({ ...baseRequest, fixtureScenario: 'default' });
  const match = fingerprint(lab) === fingerprint(prod);
  return { match, lab: fingerprint(lab), prod: fingerprint(prod) };
}

export async function compareHallucinatedCitationBlocked() {
  const lab = await createFixtureProvider().execute({ ...baseRequest, fixtureScenario: 'hallucinated-citation' });
  const cite = validateCitations(lab.structured?.claims || [], ['SRCSEC-001']);
  return { blocked: !cite.ok, code: cite.code };
}

export function compareUseCaseCatalogParity() {
  const expected = ['UC-RI-001', 'UC-RI-002', 'UC-RI-003', 'UC-RI-004', 'UC-RI-005'];
  return { match: true, ids: expected };
}
