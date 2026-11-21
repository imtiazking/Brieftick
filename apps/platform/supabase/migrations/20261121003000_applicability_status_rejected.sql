-- Applicability maker-checker: a checker rejection returns the assessment to the maker as REJECTED
-- (editable and resubmittable). Additive only; existing rows and values are unchanged.
alter type public.applicability_assessment_status add value if not exists 'REJECTED' after 'APPROVED';
