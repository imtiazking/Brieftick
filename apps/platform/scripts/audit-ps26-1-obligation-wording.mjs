#!/usr/bin/env node
/**
 * Read-only audit of the four PS26/1 OPEN obligations vs verified quotations (no credentials printed).
 */
import { createClient } from '@supabase/supabase-js';
import { obligationStatementGroundedInQuotations } from '../lib/ri/ai/finding-review-core.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for staging read.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const RUN = 'c8cb095e-2d07-4236-970c-02db88592341';

const { data: obls, error } = await admin
  .from('regulatory_obligations')
  .select('id, obligation_statement, metadata, status, citation')
  .eq('ai_analysis_run_id', RUN)
  .order('created_at');
if (error) throw error;

const out = [];
for (const o of obls || []) {
  const quote = o.metadata?.sourceQuotation || '';
  const grounded = obligationStatementGroundedInQuotations(o.obligation_statement, [quote]);
  out.push({
    id: o.id,
    status: o.status,
    provision: o.metadata?.provisionReference,
    citation: o.citation,
    grounded: grounded.ok,
    issue: grounded.ok ? null : grounded.error,
    remediation: grounded.ok ? null : 'Return to DRAFT, correct obligation wording to match verified quotation, re-submit and independent approval',
  });
}

const summary = {
  runId: RUN,
  auditedAt: new Date().toISOString(),
  obligations: out,
  passCount: out.filter((x) => x.grounded).length,
  failCount: out.filter((x) => !x.grounded).length,
  regulatoryAccuracySignOff: out.every((x) => x.grounded) ? 'READY' : 'OUTSTANDING',
};
console.log(JSON.stringify(summary, null, 2));