-- Prevent duplicate watchlist alerts for the same publication.

create unique index if not exists ri_watchlist_matches_watchlist_publication_uidx
  on public.ri_watchlist_matches (watchlist_id, publication_id)
  where publication_id is not null;