-- Staging already applied the ledger before client-role execute was revoked.
-- Supabase default privileges grant EXECUTE to anon and authenticated.
-- These functions are security definer and must stay service-role only.

revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) from public;
revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) from public;
revoke all on table public.lab_ai_spend_accounts from public;
revoke all on table public.lab_ai_spend_reservations from public;
alter table public.lab_ai_spend_accounts force row level security;
alter table public.lab_ai_spend_reservations force row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) from anon;
    revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) from anon;
    revoke all on table public.lab_ai_spend_accounts from anon;
    revoke all on table public.lab_ai_spend_reservations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) from authenticated;
    revoke all on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) from authenticated;
    revoke all on table public.lab_ai_spend_accounts from authenticated;
    revoke all on table public.lab_ai_spend_reservations from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.reserve_lab_ai_spend(text, numeric, integer, numeric, text, text, text) to service_role;
    grant execute on function public.settle_lab_ai_spend(uuid, numeric, integer, integer, boolean) to service_role;
  end if;
end $$;
