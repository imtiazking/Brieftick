#!/usr/bin/env node
/**
 * Read-only hosted PS22/9 publication date check. Does not write.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

const PUB = '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-HOSTED-PUBLICATION-METADATA-2026-11-24.json');

const result = await runAs('A', async ({ page }) => {
  const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}`);
  const body = await res.json().catch(() => null);
  const detail = body?.detail || body?.publication || {};
  const lab = body?.labPublication || {};
  return {
    http: res.status(),
    publicationDate: detail.publication_date || detail.publicationDate || null,
    effectiveDate: detail.effective_date || detail.effectiveDate || null,
    labPublishedDate: lab.publishedDate || lab.display?.published || null,
    title: detail.title || lab.title || null,
    publicationType: detail.publication_type || lab.publicationType || null,
    canonicalUrl: detail.canonical_url || null,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  publicationId: PUB,
  authoritativePublicationDate: META.publicationDate,
  hosted: result,
  matchesAuthoritativeDate: result.publicationDate === META.publicationDate || result.labPublishedDate === META.publicationDate,
  writePath:
    'PATCH /api/ri-lab/publications/:id updates applicability assessments only. It must not be used to change publication_date. No audited catalogue-date write exists.',
  correctionPreparedNotExecuted: {
    field: 'regulatory_publications.publication_date',
    fromObserved: result.publicationDate,
    to: META.publicationDate,
    preserve: ['source revisions', 'extraction runs', 'audit events', 'applicability assessments'],
    requires: 'A dedicated audited metadata correction, not service-role SQL and not an applicability PATCH.',
  },
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, http: result.http, date: result.publicationDate, match: report.matchesAuthoritativeDate }, null, 2));
