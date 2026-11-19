# Design Lab recovery runbook

## Application does not load

1. Hard refresh. Check browser console for module import errors.
2. Clear site data for Design Lab origin or use **Administration → Reset demo environment**.
3. Open `#/admin/health` for component status.

## Corrupted local state

Symptom: recovery banner or missing data.  
Action: Reset demo environment (confirms destructive). Baseline schema v10 restored.

## Migration issue

Run `node design-lab/regulatory-intelligence/scripts/acceptance-migrations.mjs`.  
If fail: reset storage.

## Connector failure

Ingestion monitor shows failed item; core Changes/Publications from seed remain. Retry item or disable live mode.

## AI runtime failure

Manual applicability and governance remain. Check `#/ai-operations` for execution errors.

## Acceptance suite failure

Read step output (expected/actual). Reset state; re-run single suite.
