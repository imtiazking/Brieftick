-- Rollback for migrations/20261119150000_ri_ai_obligation_pilot_db_guards.sql.
-- Removes the database-level pilot guards only; no table data is changed.
-- The server-side checks (experimental-ai-tenant-guard.mjs, assertAiReviewerSoD) remain in force.

drop trigger if exists ri_guard_ai_obligation_status on public.regulatory_obligations;
drop trigger if exists ri_guard_ai_review_sod on public.ai_analysis_reviews;
drop trigger if exists ri_guard_ai_assisted_change_insert on public.regulatory_changes;
drop trigger if exists ri_guard_ai_assisted_obligation_insert on public.regulatory_obligations;
drop trigger if exists ri_guard_ai_pilot_run_insert on public.ai_analysis_runs;

drop function if exists public.ri_guard_ai_obligation_status();
drop function if exists public.ri_guard_ai_review_sod();
drop function if exists public.ri_guard_ai_assisted_record_insert();
drop function if exists public.ri_guard_ai_pilot_run_insert();
drop function if exists public.ri_ai_pilot_org_id();
