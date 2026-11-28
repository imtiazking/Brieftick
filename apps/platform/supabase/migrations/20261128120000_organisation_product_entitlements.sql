-- Platform-wide product entitlements (MI, RI, R&C, future FC). Billing maps here later.

alter table public.organisations
  add column if not exists product_entitlements jsonb not null default '["market_intelligence","regulatory_intelligence","risk_controls"]'::jsonb;

comment on column public.organisations.product_entitlements is
  'Enabled FORGENIQ products for the organisation. Stripe/onboarding will maintain this; until then defaults grant MI+RI+R&C on staging.';

create index if not exists organisations_product_entitlements_gin_idx
  on public.organisations using gin (product_entitlements);