# BUS-UAT-013 — duplicate Authorised UAT actions (staging cleanup plan)

**Environment:** Supabase `forgeniq-ri-staging` (`lhgzdicffkhaaykzthep`) only  
**Organisation:** FORGENIQ (`cd25bb17-d575-4109-8432-4b63c75f9617`)

## Canonical record (retain — do not modify)

| Field | Value |
| --- | --- |
| **Action ID** | `12dc0449-84f8-4df1-ad63-bfe7540a2745` |
| **Title** | Complete Quarterly Consumer Duty Fair Value Review |
| **Provenance** | `uat_authorised` (locked) |

## Duplicates targeted for removal (after approval)

1. `d1864aa0-2ab8-4cb9-9269-2a25dd456f7c`
2. `ef651318-49e4-4ee2-ae82-de98362492cb`
3. `09e2b870-71a9-41e9-964e-f379268c98c3`
4. `e8cc3835-4c59-4695-aa40-3b5070e0e98a`
5. `4e5ec9f3-e75e-44c9-ae83-b36e78420f1d`

## Procedure (per duplicate)

1. **Pre-checks:** UUID, org, title, `uat_authorised` metadata, no workflow activity after `ACTION_CREATED`.
2. **Insert** `workflow_events` row:
   - `event_type = ADMINISTRATIVE_CORRECTION`
   - `entity_type = action`, `entity_id = <duplicate id>`
   - Metadata: `removedRecordSnapshot`, `canonicalActionId`, `preserveActionCreatedEvents: true`
3. **Delete** `actions` row (scoped by `id` + `organisation_id`).
   - `action_obligation_links` / `action_control_gap_links` **CASCADE** on `action_id`.
4. **Do not delete** existing `ACTION_CREATED` events (historical evidence of mistaken retries).

No FK from `workflow_events.entity_id` to `actions` — correction and creation events remain addressable by UUID after delete.

## Dry-run

```bash
cd apps/platform
node ./scripts/staging/phase85w-bus-uat-013-duplicate-actions-cleanup.mjs
```

## Execute (only after explicit approval)

```bash
node ./scripts/staging/phase85w-bus-uat-013-duplicate-actions-cleanup.mjs --execute
```

## Rollback

There is no automatic rollback. Recovery requires restoring from `removedRecordSnapshot` in `ADMINISTRATIVE_CORRECTION` metadata and manual re-insert (not automated).

## Manual UAT parents

Do **not** modify obligation `164b0ef5-0008-4f51-ba1b-24a86fda669b`, risk `a2de855f-754a-4598-b094-9e553a55d037`, control `276d6be9-8834-49ca-970a-ee24004bc340`.
