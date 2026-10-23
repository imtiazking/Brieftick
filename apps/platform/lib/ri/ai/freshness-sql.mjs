/**
 * Publication-version freshness (shared by ingestion engine + local DB acceptance).
 * Marks prior-version analyses OUTDATED without deleting history.
 */
export async function markAnalysesOutdatedForPublicationVersionSql(
  client,
  publicationId,
  currentVersionId,
) {
  const res = await client.query(
    `update public.ai_analysis_runs
     set freshness = 'OUTDATED'::public.ai_freshness_status,
         review_status = case
           when review_status in ('HUMAN_REVIEW_REQUIRED', 'AI_DRAFT') then 'SUPERSEDED'::public.ai_review_status
           else review_status
         end
     where publication_id = $1
       and publication_version_id is distinct from $2
       and freshness = 'CURRENT'::public.ai_freshness_status
     returning id, organisation_id`,
    [publicationId, currentVersionId],
  );
  return res.rows;
}
