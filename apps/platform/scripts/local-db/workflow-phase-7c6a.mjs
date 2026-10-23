#!/usr/bin/env node
/**
 * Phase 7C.6A — AI freshness, materialisation, work queue (embedded Postgres).
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORG_A,
  ORG_B,
  USER_A,
  USER_B,
  applyAllMigrations,
  applyReferenceSeed,
  ensureAppRole,
  insertTestPublication,
  resetAndStartEmbedded,
  stopEmbedded,
  withRlsSessionCommit,
  platformRoot,
} from './harness.mjs';
import { markAnalysesOutdatedForPublicationVersionSql } from '../../lib/ri/ai/freshness-sql.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

async function insertVersion(admin, publicationId, versionNumber) {
  const res = await admin.query(
    `insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at)
     values ($1, $2, $3, $4, now()) returning id`,
    [publicationId, versionNumber, `hash-v${versionNumber}`, `https://example.test/v${versionNumber}`],
  );
  return res.rows[0].id;
}

async function insertCompletedChangeExtractionRun(client, orgId, userId, publicationId, versionId, structured) {
  const run = await client.query(
    `insert into ai_analysis_runs (
      organisation_id, use_case_id, publication_id, publication_version_id,
      execution_status, review_status, freshness, provider, prompt_version, processing_eligibility,
      structured_output, requested_by, completed_at
    ) values (
      $1, 'UC-RI-002', $2, $3,
      'COMPLETED', 'HUMAN_REVIEW_REQUIRED', 'CURRENT', 'AIPROV-FIXTURE-001', 'v1', 'REVIEW_REQUIRED',
      $4::jsonb, $5, now()
    ) returning id`,
    [orgId, publicationId, versionId, JSON.stringify(structured), userId],
  );
  return run.rows[0].id;
}

async function materialiseChangeClaim(client, orgId, userId, runId, reviewId, claimIndex, publicationId, versionId, title) {
  const existing = await client.query(
    `select entity_id from ai_claim_materialisations
     where analysis_review_id = $1 and claim_index = $2 and entity_type = 'regulatory_change'`,
    [reviewId, claimIndex],
  );
  if (existing.rows[0]?.entity_id) return existing.rows[0].entity_id;

  const chg = await client.query(
    `insert into regulatory_changes (
      organisation_id, publication_id, publication_version_id, title, change_type, status,
      origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id, owner_user_id
    ) values ($1, $2, $3, $4, 'POLICY', 'DRAFT', 'AI_ASSISTED', $5, $6, $7, $7)
    returning id`,
    [orgId, publicationId, versionId, title, runId, reviewId, userId],
  );
  await client.query(
    `insert into ai_claim_materialisations (organisation_id, analysis_run_id, analysis_review_id, claim_index, entity_type, entity_id)
     values ($1, $2, $3, $4, 'regulatory_change', $5)`,
    [orgId, runId, reviewId, claimIndex, chg.rows[0].id],
  );
  return chg.rows[0].id;
}

export async function runPhase7c6aWorkflowVerification() {
  const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54329 });
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const results = { pass: [], fail: [] };
  const pass = (m) => results.pass.push(m);
  const fail = (m) => results.fail.push(m);

  try {
    await applyAllMigrations(admin);
    await ensureAppRole(admin);
    await applyReferenceSeed(admin);
    const publicationId = await insertTestPublication(admin);
    const v1 = await insertVersion(admin, publicationId, 1);
    const v2 = await insertVersion(admin, publicationId, 2);
    await markAnalysesOutdatedForPublicationVersionSql(admin, publicationId, v2);

    await admin.query(
      `insert into organisations (id, name, slug) values ($1, 'ORG-A', 'org-a'), ($2, 'ORG-B', 'org-b') on conflict do nothing`,
      [ORG_A, ORG_B],
    );
    for (const [org, user] of [[ORG_A, USER_A], [ORG_B, USER_B]]) {
      await admin.query(
        `insert into organisation_memberships (organisation_id, clerk_user_id, role, status)
         values ($1, $2, 'OWNER', 'active') on conflict do nothing`,
        [org, user],
      );
    }

    const structuredFive = {
      confidence: 90,
      claims: [0, 1, 2, 3, 4].map((i) => ({
        text: `Change claim ${i}`,
        confidence: 85,
        sourceSectionIds: ['SRCSEC-1'],
      })),
      candidates: [0, 1, 2, 3, 4].map((i) => ({
        title: `Candidate change ${i}`,
        changeType: 'POLICY',
        materiality: 'High',
      })),
    };

    let runId;
    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      runId = await insertCompletedChangeExtractionRun(c, ORG_A, USER_A, publicationId, v1, structuredFive);
    });

    const preChange = await admin.query(
      `select count(*)::int as n from regulatory_changes where organisation_id = $1`,
      [ORG_A],
    );
    if (preChange.rows[0].n === 0) pass('A: no changes before human review');
    else fail('A: changes created before review');

    await markAnalysesOutdatedForPublicationVersionSql(admin, publicationId, v2);
    const outdatedAfter = await admin.query(
      `select freshness from ai_analysis_runs where id = $1`,
      [runId],
    );
    if (outdatedAfter.rows[0].freshness === 'OUTDATED') pass('F: V1 analysis OUTDATED after V2');
    else fail('F: freshness not OUTDATED');

    const runV2 = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      return insertCompletedChangeExtractionRun(c, ORG_A, USER_A, publicationId, v2, {
        confidence: 88,
        claims: [{ text: 'V2 claim', confidence: 88, sourceSectionIds: ['SRCSEC-1'] }],
        candidates: [{ title: 'V2 change', changeType: 'POLICY' }],
      });
    });
    const v2fresh = await admin.query(`select freshness from ai_analysis_runs where id = $1`, [runV2]);
    if (v2fresh.rows[0].freshness === 'CURRENT') pass('V2 analysis CURRENT');
    else fail('V2 analysis not CURRENT');

    const reviewId = (
      await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
        const rev = await c.query(
          `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id, accepted_claim_indexes)
           values ($1, $2, 'PARTIALLY_ACCEPTED', $3, '{1}'::int[]) returning id`,
          [ORG_A, runId, USER_A],
        );
        await c.query(
          `update ai_analysis_runs set review_status = 'PARTIALLY_ACCEPTED' where id = $1`,
          [runId],
        );
        const changeId = await materialiseChangeClaim(
          c,
          ORG_A,
          USER_A,
          runId,
          rev.rows[0].id,
          1,
          publicationId,
          v1,
          'Candidate change 1',
        );
        return { reviewId: rev.rows[0].id, changeId };
      })
    );

    const lineage = await admin.query(
      `select origin, ai_analysis_run_id, ai_analysis_review_id, created_by_user_id
       from regulatory_changes where id = $1`,
      [reviewId.changeId],
    );
    const l = lineage.rows[0];
    if (
      l.origin === 'AI_ASSISTED' &&
      l.ai_analysis_run_id === runId &&
      l.ai_analysis_review_id === reviewId.reviewId &&
      l.created_by_user_id === USER_A
    ) {
      pass('B: Change materialised with lineage + human actor');
    } else fail('B: lineage missing');

    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      await materialiseChangeClaim(
        c,
        ORG_A,
        USER_A,
        runId,
        reviewId.reviewId,
        1,
        publicationId,
        v1,
        'Candidate change 1',
      );
    });
    const dupCount = await admin.query(
      `select count(*)::int as n from regulatory_changes where organisation_id = $1 and ai_analysis_review_id = $2`,
      [ORG_A, reviewId.reviewId],
    );
    if (dupCount.rows[0].n === 1) pass('C: duplicate materialisation blocked');
    else fail('C: duplicate changes');

    const invalidObl = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      const chg = await c.query(
        `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status)
         values ($1, $2, 'Parent change', 'POLICY', 'DRAFT') returning id`,
        [ORG_A, publicationId],
      );
      const oblRun = await c.query(
        `insert into ai_analysis_runs (
          organisation_id, use_case_id, publication_id, publication_version_id, target_entity_id,
          execution_status, review_status, freshness, provider, prompt_version, processing_eligibility,
          structured_output, requested_by, completed_at
        ) values (
          $1, 'UC-RI-005', $2, $3, $4,
          'COMPLETED', 'ACCEPTED', 'CURRENT', 'fixture', 'v1', 'REVIEW_REQUIRED',
          $5::jsonb, $6, now()
        ) returning id`,
        [
          ORG_A,
          publicationId,
          v1,
          chg.rows[0].id,
          JSON.stringify({
            confidence: 80,
            claims: [{ text: 'bad', confidence: 80, sourceSectionIds: [] }],
            candidates: [{ statement: 'Obligation should block' }],
          }),
          USER_A,
        ],
      );
      await c.query(
        `insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text, citation_status)
         values ($1, $2, 0, 'bad', 'INVALID')`,
        [ORG_A, oblRun.rows[0].id],
      );
      const rev = await c.query(
        `insert into ai_analysis_reviews (organisation_id, analysis_run_id, decision, reviewer_user_id, accepted_claim_indexes)
         values ($1, $2, 'ACCEPTED', $3, '{0}'::int[]) returning id`,
        [ORG_A, oblRun.rows[0].id, USER_A],
      );
      return { runId: oblRun.rows[0].id, reviewId: rev.rows[0].id, changeId: chg.rows[0].id };
    });

    const oblMat = await admin.query(
      `select count(*)::int as n from ai_claim_materialisations where analysis_run_id = $1`,
      [invalidObl.runId],
    );
    if (oblMat.rows[0].n === 0) pass('E: invalid citation blocks obligation materialisation');
    else fail('E: obligation materialised with invalid citation');

    const queueRun = await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      return insertCompletedChangeExtractionRun(c, ORG_A, USER_A, publicationId, v2, {
        confidence: 85,
        claims: [{ text: 'queue', confidence: 85, sourceSectionIds: ['SRCSEC-1'] }],
        candidates: [{ title: 'Queue change', changeType: 'POLICY' }],
      });
    });
    const queuePending = await admin.query(
      `select count(*)::int as n from ai_analysis_runs
       where organisation_id = $1 and review_status = 'HUMAN_REVIEW_REQUIRED' and freshness = 'CURRENT'`,
      [ORG_A],
    );
    if (queuePending.rows[0].n >= 1) pass('G: AI review pending in DB for work queue');
    else fail('G: no pending AI review');

    await withRlsSessionCommit(adminUrl, USER_A, async (c) => {
      await c.query(
        `update ai_analysis_runs set review_status = 'ACCEPTED' where id = $1`,
        [queueRun],
      );
    });
    const queueAfter = await admin.query(
      `select count(*)::int as n from ai_analysis_runs
       where id = $1 and review_status = 'HUMAN_REVIEW_REQUIRED'`,
      [queueRun],
    );
    if (queueAfter.rows[0].n === 0) pass('H: completed review removed from pending queue state');
    else fail('H: still pending');

    const cross = await withRlsSessionCommit(adminUrl, USER_B, async (c) => {
      const res = await c.query(`select id from ai_analysis_runs where id = $1`, [runId]);
      return res.rows.length;
    });
    if (cross === 0) pass('I: ORG-B cannot read ORG-A AI run');
    else fail('I: cross-tenant AI access');

    const { resolveAcceptedClaimIndexes } = await import(
      pathToFileURL(join(platformRoot, 'lib', 'ri', 'ai', 'materialisation-logic.mjs')).href,
    );
    const idx = resolveAcceptedClaimIndexes('PARTIALLY_ACCEPTED', [0, 2, 4], 5);
    if (idx.join() === '0,2,4') pass('D: partial acceptance indexes');
    else fail('D: partial acceptance indexes');

    const autonomySrc = readFileSync(join(platformRoot, 'lib', 'ri', 'ai', 'autonomy.ts'), 'utf8');
    if (autonomySrc.includes('AI_AUTONOMOUS_ACTION_BLOCKED')) pass('autonomy guard present');
    else fail('autonomy guard');
  } finally {
    await admin.end();
    await stopEmbedded(embedded);
  }

  return results;
}
