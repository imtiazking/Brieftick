/**
 * Emits the additive staging backfill SQL for the FCA-EVAL-001 pilot obligation.
 * - Adds effective_date + commencement/provisionBreakdown/transitionalScan provenance to metadata (jsonb merge).
 * - Never overwrites existing metadata keys (modelBindingLabels, sourceQuotation, classification ... are preserved).
 * - Only touches an OPEN, still-undated obligation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../../../../docs/uat/evidence/live-ai-pilot-2026-11-26/saved-outputs');
const payload = JSON.parse(readFileSync(resolve(dir, 'obligation-commencement-backfill-payload.json'), 'utf8'));
const json = JSON.stringify(payload);
if (json.includes('$bf$')) throw new Error('payload contains dollar-quote tag');
const id = 'dc63a70a-d795-430a-99bc-34a5e73896c5';
const sql = `update public.regulatory_obligations
set effective_date = date '${payload.commencement.commencementDate}',
    metadata = $bf$${json}$bf$::jsonb || metadata
where id = '${id}' and status = 'OPEN' and effective_date is null
returning id, effective_date, metadata->'commencement'->>'commencementDate' as meta_commencement,
  metadata->>'sourceQuotation' is not null as quotation_kept, metadata ? 'modelBindingLabels' as labels_kept;`;
writeFileSync(resolve(dir, 'obligation-commencement-backfill.sql'), sql);
console.log('wrote', sql.length, 'chars');
