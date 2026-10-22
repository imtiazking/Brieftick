-- Local-only shim: simulates Supabase auth.jwt() for embedded PostgreSQL verification.
-- Applied by acceptance-phase-3a-local-db.mjs — NOT a production migration.

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select case
    when coalesce(current_setting('app.test_jwt', true), '') <> ''
      then current_setting('app.test_jwt', true)::jsonb
    when coalesce(current_setting('app.test_jwt', false), '') <> ''
      then current_setting('app.test_jwt', false)::jsonb
    else '{}'::jsonb
  end;
$$;
