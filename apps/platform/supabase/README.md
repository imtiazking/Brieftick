# Supabase foundation

Production target region: **London (eu-west-2)** when the project is provisioned.

## Scope (Phase 1)

- Client/server utilities in `lib/supabase/`
- Migration directory scaffold only
- No RI business tables
- No remote migration execution from CI without approval

## Tenancy (later)

```
Clerk user/session → organisation membership → Supabase RLS → tenant-scoped FORGENIQ records
```

Organisation tables and RLS policies will be added in a later phase.
