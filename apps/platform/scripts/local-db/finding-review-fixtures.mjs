/**
 * Shared fixtures for the UC-RI-005 per-finding review acceptance tests (embedded Postgres only).
 * Wording follows run cb124305 findings 1–4 and 10, with FCA FG24/6 quotations from pages 14 and 16.
 */
import { createHash } from 'node:crypto';
import { insertTestPublication } from './harness.mjs';

export const PILOT = 'b8f5e3a1-00ad-4000-8000-000000000001';
export const OTHER = 'c0000000-0000-4000-8000-000000000002';
export const GMAIL = 'user_gmail_requester';
export const YAHOO = 'user_yahoo_reviewer';
export const THIRD = 'user_third_approver';
export const VIEWER = 'user_viewer';
export const OUTSIDER = 'user_other_org_owner';
export const REVISION = '5138fabf-983f-4694-81d4-0336df6f4e78';

export const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

export const QUOTES = {
  notify:
    'A PSP that delays crediting the amount of a payment transaction under these provisions must notify the payer of the delay, the reason for the delay, and any information or action needed from the payer to enable the PSP to decide whether to execute the order.',
  endDelay:
    'The delay must not be longer than necessary to achieve this purpose. In our view, this means that a PSP must execute a payment order as soon as it has contacted the payer or other relevant third parties and established that it should execute the payment order',
  liability:
    'A PSP will also be liable to its customer for any charges or interest for which the customer is responsible, and any interest which the payment service user must pay, as a consequence of delay to the execution of a payment order',
};

export const FINDINGS = [
  { text: 'PSPs may delay processing payment transactions for up to 4 business days where reasonable grounds exist.', sections: ['S1', 'S14'] },
  { text: 'PSPs must notify payers of payment delays, reasons, and required information/actions by the end of the next business day.', sections: ['S14'] },
  { text: 'Payment delays must end as soon as the PSP establishes the payment should be executed.', sections: ['S14'] },
  { text: 'PSPs are liable for any charges or interest customers incur as a direct consequence of payment delays.', sections: ['S9', 'S16'] },
  { text: 'Card payments initiated by payees are outside the scope of the payment delay provisions.', sections: ['S4'] },
];

export const CATALOG = [
  { sourceSectionId: 'S1', pageNumber: 1, citation: 'PDF p.1', excerpt: 'Finalised guidance FG24/6' },
  { sourceSectionId: 'S4', pageNumber: 4, citation: 'PDF p.4', excerpt: 'Scope' },
  { sourceSectionId: 'S9', pageNumber: 9, citation: 'PDF p.9', excerpt: 'Liability' },
  { sourceSectionId: 'S14', pageNumber: 14, citation: 'PDF p.14', excerpt: 'Notification' },
  { sourceSectionId: 'S16', pageNumber: 16, citation: 'PDF p.16', excerpt: 'Charges and interest' },
];

/** TEST DATA: the same sections recorded as legal-instrument pages that set out synthetic provisions. */
export const INSTRUMENT_CATALOG = CATALOG.map((s) => ({
  ...s,
  inLegalInstrument: s.pageNumber >= 9,
  transitionalProvisions: false,
  provisionsSetOut: { 9: ['15.2.3R'], 14: ['15.2.1UK'], 16: ['15.2.3R'] }[s.pageNumber] ?? [],
}));
export const INSTRUMENT_PROVISIONS = {
  1: { provisionReference: 'PERG 15.2.1 UK', provisionFunction: 'OPERATIVE_REQUIREMENT' },
  3: { provisionReference: 'PERG 15.2.3R', provisionFunction: 'OPERATIVE_REQUIREMENT' },
};

/** Page text as the PDF extraction stores it (line breaks and typographic apostrophes). */
export const PAGE_TEXT = {
  14: `Financial Conduct Authority Page 14 of 17 3.12 The delay must not be longer than necessary to achieve this purpose. In our view, this means that a PSP must execute a payment order as soon as it has contacted the payer or other relevant third parties and established that it should execute the payment order, rather than pursuing a policy of waiting until the end of the fourth business day to do so.\n3.13 A PSP that delays crediting the amount of a payment transaction under these provisions must notify the payer of the delay, the reason for the delay, and any information or action needed from the payer to enable the PSP to decide whether to execute the order. This notification must be provided or made available in an agreed manner as soon as possible.`,
  16: `Financial Conduct Authority Page 16 of 17 A PSP will also be liable to its customer for any charges or interest for which the customer is responsible, and any interest which the payment service user must pay, as a consequence of delay to the execution of a payment order in reliance on Regulation 86(2B) of the PSRs 2017 irrespective of whether the payment order is ultimately executed.`,
  9: 'Financial Conduct Authority Page 9 of 17 Liability overview.',
  4: 'Financial Conduct Authority Page 4 of 17 Card payments initiated by or through the payee are outside scope.',
  1: 'Financial Conduct Authority FG24/6 Finalised guidance.',
};

export const CANDIDATES = [
  { statement: 'Unrelated candidate A', sourceQuotation: 'Unrelated quotation A for the test.', bindingNature: 'guidance', sourceSectionIds: ['S1'] },
  { statement: FINDINGS[2].text, sourceQuotation: QUOTES.endDelay, bindingNature: 'guidance', sourceSectionIds: ['S14'], citation: 'PDF p.14' },
  { statement: FINDINGS[1].text, sourceQuotation: QUOTES.notify, bindingNature: 'binding_requirement', sourceSectionIds: ['S14'], citation: 'PDF p.14' },
];

export async function seedFindingReviewFixtures(db) {
  const pubId = await insertTestPublication(db);
  const verId = (
    await db.query(
      `insert into regulatory_publication_versions (publication_id, version_number, source_hash, canonical_url, retrieved_at)
       values ($1, 1, 'hash-1', 'https://example.test/pub', now()) returning id`,
      [pubId],
    )
  ).rows[0].id;
  await db.query(
    `insert into organisations (id, name, slug) values ($1, 'AI Development (test)', 'ai-dev-test'), ($2, 'Other org (test)', 'other-test')`,
    [PILOT, OTHER],
  );
  for (const [org, user, role] of [
    [PILOT, GMAIL, 'COMPLIANCE_MANAGER'],
    [PILOT, YAHOO, 'COMPLIANCE_MANAGER'],
    [PILOT, THIRD, 'COMPLIANCE_MANAGER'],
    [PILOT, VIEWER, 'VIEWER'],
    [OTHER, OUTSIDER, 'OWNER'],
  ]) {
    await db.query(
      `insert into organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, $3::platform_role, 'active')`,
      [org, user, role],
    );
  }
  const changeId = (
    await db.query(
      `insert into regulatory_changes (organisation_id, publication_id, title, change_type, status, metadata)
       values ($1, $2, 'FG24/6 payment delays (test)', 'TEST', 'OPEN', '{"recordProvenance":"uat_authorised","labProvenanceLocked":true}'::jsonb) returning id`,
      [PILOT, pubId],
    )
  ).rows[0].id;

  const insertRun = async (key, gradeSuitable, catalog = CATALOG) => {
    const output = {
      claims: FINDINGS.map((f) => ({ text: f.text, confidence: 90, sourceSectionIds: f.sections })),
      candidates: CANDIDATES,
      _forgeniqGrounding: { kind: 'pdf_primary_v1', extractionRevisionId: REVISION, obligationGradeSuitable: gradeSuitable, sectionCatalog: catalog },
    };
    const runId = (
      await db.query(
        `insert into ai_analysis_runs (organisation_id, use_case_id, publication_id, publication_version_id, provider, prompt_version,
           requested_by, execution_status, review_status, idempotency_key, structured_output, target_entity_id)
         values ($1, 'UC-RI-005', $2, $3, 'ANTHROPIC', 'v1', $4, 'COMPLETED', 'HUMAN_REVIEW_REQUIRED', $5, $6, $7) returning id`,
        [PILOT, pubId, verId, GMAIL, key, JSON.stringify(output), changeId],
      )
    ).rows[0].id;
    const ids = [];
    for (const [i, f] of FINDINGS.entries()) {
      ids.push(
        (
          await db.query(
            `insert into ai_analysis_citations (organisation_id, analysis_run_id, claim_index, claim_text, source_section_ids, citation_status)
             values ($1, $2, $3, $4, $5, 'VERIFIED') returning id`,
            [PILOT, runId, i, f.text, f.sections],
          )
        ).rows[0].id,
      );
    }
    return { runId, ids };
  };

  return { pubId, verId, changeId, insertRun };
}
