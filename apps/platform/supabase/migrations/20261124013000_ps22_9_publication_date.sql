-- Audited correction of the hosted PS22/9 publication date only.
-- FCA first published 27 July 2022. Does not change source hash, title, type, or any other publication.

do $$
declare
  target constant uuid := '7a73ac4c-d6b4-4411-9f6d-1276053f2831';
  prev date;
  n int;
begin
  select publication_date into prev
  from public.regulatory_publications
  where id = target
    and title = 'PS22/9: A new Consumer Duty'
    and publication_type = 'policy_statement'
  for update;

  -- A clean local database has no catalogue row. The correction applies only where the hosted record exists.
  if found then
  if prev is not null and prev is distinct from date '2022-07-27' then
    raise exception 'ps22_9_publication_date_unexpected: %', prev;
  end if;

  if prev is distinct from date '2022-07-27' then
    update public.regulatory_publications
    set publication_date = date '2022-07-27',
        provenance = jsonb_set(
          provenance,
          '{metadataCorrections}',
          coalesce(provenance->'metadataCorrections', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'field', 'publication_date',
              'from', to_jsonb(prev),
              'to', '2022-07-27',
              'authority', 'https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty',
              'reason', 'FCA record first published 27 July 2022; hosted publication_date was null',
              'correctedAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'mechanism', '20261124013000_ps22_9_publication_date'
            )
          ),
          true
        )
    where id = target
      and title = 'PS22/9: A new Consumer Duty'
      and publication_type = 'policy_statement'
      and publication_date is not distinct from prev
      and source_hash is not null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'ps22_9_publication_date_update_count %', n;
    end if;
  end if;
  end if;
end $$;
