/**
 * Match newly ingested publications against enabled tenant watchlists (staging in-app alerts only).
 * @param {import('pg').Client} client
 */
export async function matchIngestedPublicationsWatchlists(client, params) {
  const { organisationId, publicationIds, environment } = params;
  if (environment !== 'staging') {
    return { skipped: true, reason: 'not_staging' };
  }
  if (!organisationId || !publicationIds?.length) {
    return { skipped: true, reason: 'no_publications' };
  }

  const wls = await client.query(
    `select id, name, scope, owner_user_id, filters
     from ri_watchlists
     where organisation_id = $1::uuid and enabled = true`,
    [organisationId],
  );
  if (!wls.rowCount) return { skipped: true, reason: 'no_watchlists', organisationId };

  const pubs = await client.query(
    `select p.id, p.title, p.publication_type, r.external_key as regulator_key
     from regulatory_publications p
     left join regulators r on r.id = p.regulator_id
     where p.id = any($1::uuid[])`,
    [publicationIds],
  );

  let matches = 0;
  for (const pub of pubs.rows) {
    for (const wl of wls.rows) {
      const filters = wl.filters && typeof wl.filters === 'object' ? wl.filters : {};
      const keys = Array.isArray(filters.regulatorKeys) ? filters.regulatorKeys : [];
      const keywords = Array.isArray(filters.keywords) ? filters.keywords : [];
      const types = Array.isArray(filters.publicationTypes) ? filters.publicationTypes : [];
      if (keys.length && (!pub.regulator_key || !keys.includes(pub.regulator_key))) continue;
      if (types.length && !types.some((t) => String(pub.publication_type || '').toLowerCase().includes(String(t).toLowerCase()))) {
        continue;
      }
      const blob = `${pub.title} ${pub.publication_type}`.toLowerCase();
      if (keywords.length && !keywords.some((k) => blob.includes(String(k).toLowerCase()))) continue;
      const reason = keys.length ? `Regulator ${pub.regulator_key}` : keywords[0] ? `Keyword ${keywords[0]}` : 'Watchlist filters';

      const note = await client.query(
        `insert into tenant_notifications (
           organisation_id, recipient_user_id, notification_type, severity,
           title, message, entity_type, entity_id, link_path, created_by_user_id, payload
         ) values (
           $1, $2, 'WATCHLIST', 'MEDIUM',
           $3, $4, 'publication', $5, $6, 'system:watchlist-match', $7::jsonb
         ) returning id`,
        [
          organisationId,
          wl.scope === 'personal' ? wl.owner_user_id : null,
          `Watchlist — ${wl.name}`,
          `${pub.title} (${reason})`,
          pub.id,
          `#/publication/${pub.id}`,
          JSON.stringify({ watchlistId: wl.id, matchReason: reason }),
        ],
      );
      await client.query(
        `insert into ri_watchlist_matches (
           organisation_id, watchlist_id, publication_id, match_reason, notification_id, payload
         ) values ($1, $2, $3, $4, $5, $6::jsonb)`,
        [organisationId, wl.id, pub.id, reason, note.rows[0]?.id ?? null, JSON.stringify({ watchlistId: wl.id })],
      );
      matches += 1;
    }
  }
  return { skipped: false, organisationId, matches };
}