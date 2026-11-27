import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createTenantNotification } from '@/lib/ri/services/tenant-notifications';

export type WatchlistScope = 'personal' | 'organisation';

export type WatchlistFilters = {
  regulatorKeys?: string[];
  jurisdictionCodes?: string[];
  topicLabels?: string[];
  publicationTypes?: string[];
  publicationIds?: string[];
  keywords?: string[];
  regulatoryChangeIds?: string[];
  obligationIds?: string[];
};

export type WatchlistRow = {
  id: string;
  organisation_id: string;
  scope: WatchlistScope;
  name: string;
  description: string | null;
  enabled: boolean;
  owner_user_id: string | null;
  filters: WatchlistFilters;
  created_at: string;
  updated_at: string;
};

function parseFilters(raw: unknown): WatchlistFilters {
  if (!raw || typeof raw !== 'object') return {};
  const f = raw as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(f[k]) ? f[k].map((x) => String(x).trim()).filter(Boolean) : undefined);
  return {
    regulatorKeys: arr('regulatorKeys'),
    jurisdictionCodes: arr('jurisdictionCodes'),
    topicLabels: arr('topicLabels'),
    publicationTypes: arr('publicationTypes'),
    publicationIds: arr('publicationIds'),
    keywords: arr('keywords'),
    regulatoryChangeIds: arr('regulatoryChangeIds'),
    obligationIds: arr('obligationIds'),
  };
}

export async function listWatchlists(
  supabase: SupabaseClient,
  organisationId: string,
  userId: string,
  opts?: { includeDisabled?: boolean },
): Promise<WatchlistRow[]> {
  let q = supabase.from('ri_watchlists').select('*').eq('organisation_id', organisationId);
  if (!opts?.includeDisabled) q = q.eq('enabled', true);
  const { data, error } = await q.order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ ...row, filters: parseFilters(row.filters) })) as WatchlistRow[];
}

export type WatchlistMatchRow = {
  id: string;
  watchlist_id: string;
  publication_id: string | null;
  regulatory_change_id: string | null;
  obligation_id: string | null;
  matched_at: string;
  match_reason: string;
  notification_id: string | null;
};

export async function listWatchlistMatches(
  supabase: SupabaseClient,
  organisationId: string,
  opts?: { watchlistId?: string; limit?: number },
): Promise<WatchlistMatchRow[]> {
  let q = supabase
    .from('ri_watchlist_matches')
    .select('id, watchlist_id, publication_id, regulatory_change_id, obligation_id, matched_at, match_reason, notification_id')
    .eq('organisation_id', organisationId)
    .order('matched_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.watchlistId) q = q.eq('watchlist_id', opts.watchlistId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as WatchlistMatchRow[];
}

export async function upsertWatchlist(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    id?: string;
    scope: WatchlistScope;
    name: string;
    description?: string | null;
    enabled?: boolean;
    filters?: WatchlistFilters;
  },
): Promise<WatchlistRow> {
  const payload = {
    organisation_id: params.organisationId,
    scope: params.scope,
    name: params.name.trim(),
    description: params.description?.trim() || null,
    enabled: params.enabled !== false,
    owner_user_id: params.scope === 'personal' ? params.userId : null,
    filters: params.filters ?? {},
    created_by_user_id: params.userId,
    updated_by_user_id: params.userId,
  };
  const q = params.id
    ? supabase.from('ri_watchlists').update(payload).eq('id', params.id).eq('organisation_id', params.organisationId)
    : supabase.from('ri_watchlists').insert(payload);
  const { data, error } = await q.select().single();
  if (error) throw new Error(error.message);
  return { ...(data as WatchlistRow), filters: parseFilters(data.filters) };
}

export type PublicationMatchInput = {
  id: string;
  title: string;
  publication_type: string;
  regulator?: { external_key?: string } | null;
  canonical_url?: string;
};

export function publicationMatchesWatchlist(pub: PublicationMatchInput, filters: WatchlistFilters): string | null {
  if (filters.publicationIds?.length && !filters.publicationIds.includes(pub.id)) return null;
  const regKey = pub.regulator?.external_key;
  if (filters.regulatorKeys?.length && (!regKey || !filters.regulatorKeys.includes(regKey))) return null;
  if (filters.publicationTypes?.length && !filters.publicationTypes.some((t) => pub.publication_type?.toLowerCase().includes(t.toLowerCase()))) {
    return null;
  }
  const blob = `${pub.title} ${pub.publication_type} ${pub.canonical_url || ''}`.toLowerCase();
  if (filters.keywords?.length && !filters.keywords.some((k) => blob.includes(k.toLowerCase()))) return null;
  if (filters.topicLabels?.length && !filters.topicLabels.some((t) => blob.includes(t.toLowerCase()))) return null;
  return filters.regulatorKeys?.length
    ? `Regulator watch: ${regKey}`
    : filters.keywords?.length
      ? `Keyword watch: ${filters.keywords.find((k) => blob.includes(k.toLowerCase()))}`
      : 'Publication matched watchlist filters';
}

export async function recordWatchlistMatch(params: {
  organisationId: string;
  watchlistId: string;
  watchlistName: string;
  publicationId: string;
  publicationTitle: string;
  matchReason: string;
  recipientUserId?: string | null;
  createdByUserId?: string;
}): Promise<{ notificationId: string | null; matchId: string | null; duplicate?: boolean }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { notificationId: null, matchId: null };

  const { data: existing } = await admin
    .from('ri_watchlist_matches')
    .select('id')
    .eq('watchlist_id', params.watchlistId)
    .eq('publication_id', params.publicationId)
    .maybeSingle();
  if (existing?.id) {
    return { notificationId: null, matchId: null, duplicate: true };
  }

  const notification = await createTenantNotification(admin, {
    organisationId: params.organisationId,
    createdByUserId: params.createdByUserId ?? 'system:watchlist',
    recipientUserId: params.recipientUserId ?? null,
    notificationType: 'WATCHLIST',
    severity: 'MEDIUM',
    title: `Watchlist — ${params.watchlistName}`,
    message: `${params.publicationTitle} (${params.matchReason})`,
    entityType: 'publication',
    entityId: params.publicationId,
    linkPath: `#/publication/${params.publicationId}`,
    payload: { watchlistId: params.watchlistId, matchReason: params.matchReason },
  });

  const { data, error } = await admin
    .from('ri_watchlist_matches')
    .insert({
      organisation_id: params.organisationId,
      watchlist_id: params.watchlistId,
      publication_id: params.publicationId,
      match_reason: params.matchReason,
      notification_id: notification.id,
      payload: { watchlistId: params.watchlistId },
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      return { notificationId: null, matchId: null, duplicate: true };
    }
    console.error('[watchlist] match_persist_failed', error.message);
    return { notificationId: notification.id, matchId: null };
  }
  return { notificationId: notification.id, matchId: data.id as string, duplicate: false };
}

/** Evaluate a catalogue publication against enabled watchlists (staging UAT / ingest path). */
export async function evaluatePublicationAgainstWatchlists(
  supabase: SupabaseClient,
  organisationId: string,
  publication: PublicationMatchInput,
): Promise<{ matches: number; duplicates: number }> {
  const watchlists = await listWatchlists(supabase, organisationId, 'system');
  let matches = 0;
  let duplicates = 0;
  for (const wl of watchlists) {
    if (!wl.enabled) continue;
    const reason = publicationMatchesWatchlist(publication, wl.filters);
    if (!reason) continue;
    const r = await recordWatchlistMatch({
      organisationId,
      watchlistId: wl.id,
      watchlistName: wl.name,
      publicationId: publication.id,
      publicationTitle: publication.title,
      matchReason: reason,
      recipientUserId: wl.scope === 'personal' ? wl.owner_user_id : null,
    });
    if (r.duplicate) duplicates += 1;
    else if (r.matchId || r.notificationId) matches += 1;
  }
  return { matches, duplicates };
}

export async function matchIngestedPublicationsToWatchlists(
  supabase: SupabaseClient,
  organisationId: string,
  publications: PublicationMatchInput[],
  userIdForPersonal?: string,
): Promise<{ matches: number }> {
  const watchlists = await listWatchlists(supabase, organisationId, userIdForPersonal || 'system:watchlist');
  let matches = 0;
  for (const pub of publications) {
    for (const wl of watchlists) {
      if (!wl.enabled) continue;
      const reason = publicationMatchesWatchlist(pub, wl.filters);
      if (!reason) continue;
      const r = await recordWatchlistMatch({
        organisationId,
        watchlistId: wl.id,
        watchlistName: wl.name,
        publicationId: pub.id,
        publicationTitle: pub.title,
        matchReason: reason,
        recipientUserId: wl.scope === 'personal' ? wl.owner_user_id : null,
      });
      if (!r.duplicate) matches += 1;
    }
  }
  return { matches };
}