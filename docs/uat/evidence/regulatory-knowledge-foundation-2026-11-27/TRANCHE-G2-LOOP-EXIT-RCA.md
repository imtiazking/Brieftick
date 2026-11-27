# Tranche G2 corpus loop early exit — RCA

**Symptom:** `tranche-g-corpus-backfill-loop.mjs` stopped at **tick 85/200** with `exit_code: 0` while `remainingWithoutSnapshot` was still **119**.

**Root cause (confirmed defect):** errant stop condition in `tranche-g-corpus-backfill-loop.mjs`:

```javascript
if (parsed.terminal_excluded && parsed.remainingWithoutSnapshot <= parsed.terminal_excluded) break;
```

At tick 85: `remainingWithoutSnapshot=119`, `terminal_excluded=121` → condition true → loop exited even though **119 eligible publications** still lacked snapshots.

**Classification:** `CONFIRMED_DEFECT` (loop control logic), not ingestion regression.

**Fix:** Removed the condition (2026-11-27). Loop now stops only on `remainingWithoutSnapshot === 0`, hosted route 404, or tick limit.

**Resume:** `TRANCHE_G_CORPUS_RESUME=true`, `TRANCHE_G_CORPUS_MAX_TICKS=130`, separate evidence file `CORPUS-BACKFILL-LOOP-RESUME.json`.