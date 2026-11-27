/**
 * Staging-only: fan out new publication rows to UAT tenant Attention Centre (in-app).
 * Requires FORGENIQ_STAGING_UAT_INTAKE_NOTIFY=true (never set on hosted cron by default).
 * @param {import('pg').Client} client
 */
export async function fanOutStagingIntakeNotifications(client, params) {
  const { runId, sourceExternalKey, environment } = params;
  if (environment !== 'staging') {
    return { skipped: true, reason: 'not_staging' };
  }
  if (process.env.FORGENIQ_STAGING_UAT_INTAKE_NOTIFY !== 'true') {
    return { skipped: true, reason: 'FORGENIQ_STAGING_UAT_INTAKE_NOTIFY_not_true' };
  }

  const orgRes = await client.query(
    `select id from organisations where lower(coalesce(slug, name)) like '%forgeniq%' order by created_at asc limit 1`,
  );
  const organisationId = orgRes.rows[0]?.id;
  if (!organisationId) {
    return { skipped: true, reason: 'uat_organisation_not_found' };
  }

  const pubs = await client.query(
    `select distinct ii.publication_id, rp.title
     from ingestion_items ii
     join regulatory_publications rp on rp.id = ii.publication_id
     where ii.ingestion_run_id = $1::uuid
       and ii.publication_id is not null
       and ii.normalisation_status = 'NEW'::ingestion_item_normalisation_status`,
    [runId],
  );

  if (!pubs.rowCount) {
    return { skipped: true, reason: 'no_new_publication_items', organisationId };
  }

  let tenantNotifications = 0;
  let intakeRows = 0;
  for (const row of pubs.rows) {
    await client.query(
      `insert into organisation_publications (organisation_id, publication_id, triage_status, relevance_status)
       values ($1, $2, 'NEW'::organisation_publication_triage_status, 'UNREVIEWED')
       on conflict (organisation_id, publication_id) do nothing`,
      [organisationId, row.publication_id],
    );
    intakeRows += 1;

    const ins = await client.query(
      `insert into tenant_notifications (
         organisation_id, recipient_user_id, notification_type, severity,
         title, message, entity_type, entity_id, link_path, created_by_user_id, payload
       ) values (
         $1, null, 'OPERATIONAL'::tenant_notification_type, 'MEDIUM'::tenant_notification_severity,
         $2, $3, 'publication', $4, $5, 'system:ingestion', $6::jsonb
       )
       returning id`,
      [
        organisationId,
        `New regulatory publication — ${sourceExternalKey}`,
        row.title?.slice(0, 500) || 'New publication available for intake triage.',
        row.publication_id,
        `#/intake/${row.publication_id}`,
        JSON.stringify({ sourceId: sourceExternalKey, ingestionRunId: runId }),
      ],
    );
    if (ins.rowCount) tenantNotifications += 1;
  }

  const publicationIds = pubs.rows.map((r) => r.publication_id);
  let watchlistMatches = 0;
  if (publicationIds.length) {
    const { matchIngestedPublicationsWatchlists } = await import('./watchlist-ingest-match.mjs');
    const wl = await matchIngestedPublicationsWatchlists(client, {
      organisationId,
      publicationIds,
      environment,
    });
    if (!wl.skipped) watchlistMatches = wl.matches ?? 0;
  }

  return {
    skipped: false,
    organisationId,
    newPublications: pubs.rowCount,
    tenantNotifications,
    intakeRows,
    watchlistMatches,
  };
}
