#!/usr/bin/env node
/**
 * Remove P85W012-* BUS-UAT-012 acceptance fixtures (staging service-role).
 * Does not delete manual Test 12 journey rows (487cd38f, 164b0ef5, 277132be).
 */
import { createClient } from '@supabase/supabase-js';
import { loadPlatformEnv, resolvePlatformRoot } from './load-platform-env.mjs';
import { FORGENIQ_UAT_ORG_A } from './hosted-uat-playwright-session.mjs';

const platformRoot = resolvePlatformRoot(import.meta.url);
loadPlatformEnv(platformRoot);

const PREFIX = process.argv[2] || 'P85W012';
const ORG = FORGENIQ_UAT_ORG_A;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error(JSON.stringify({ ok: false, error: 'missing_supabase_env' }));
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: changes } = await admin
    .from('regulatory_changes')
    .select('id')
    .eq('organisation_id', ORG)
    .ilike('title', `${PREFIX}%`);
  const changeIds = (changes || []).map((c) => c.id);

  const oblIdSet = new Set();
  const { data: oblsByChange } =
    changeIds.length > 0
      ? await admin
          .from('regulatory_obligations')
          .select('id')
          .eq('organisation_id', ORG)
          .in('regulatory_change_id', changeIds)
      : { data: [] };
  for (const o of oblsByChange || []) oblIdSet.add(o.id);

  const { data: oblsByTitle } = await admin
    .from('regulatory_obligations')
    .select('id')
    .eq('organisation_id', ORG)
    .ilike('obligation_statement', `${PREFIX}%`);
  for (const o of oblsByTitle || []) oblIdSet.add(o.id);
  const oblIds = [...oblIdSet];

  let impactIds = [];
  if (changeIds.length) {
    const { data: impacts } = await admin
      .from('impact_assessments')
      .select('id')
      .eq('organisation_id', ORG)
      .in('regulatory_change_id', changeIds);
    impactIds = (impacts || []).map((i) => i.id);
  }

  const { data: risks } = await admin
    .from('risks')
    .select('id')
    .eq('organisation_id', ORG)
    .ilike('title', `${PREFIX}%`);
  const riskIds = (risks || []).map((r) => r.id);

  const { data: controls } = await admin
    .from('controls')
    .select('id')
    .eq('organisation_id', ORG)
    .ilike('name', `${PREFIX}%`);
  const controlIds = (controls || []).map((c) => c.id);

  const allEntityIds = [...new Set([...changeIds, ...oblIds, ...impactIds, ...riskIds, ...controlIds])];

  if (oblIds.length) {
    await admin.from('obligation_risk_links').delete().eq('organisation_id', ORG).in('obligation_id', oblIds);
    await admin.from('obligation_control_links').delete().eq('organisation_id', ORG).in('obligation_id', oblIds);
  }
  if (riskIds.length) {
    await admin.from('obligation_risk_links').delete().eq('organisation_id', ORG).in('risk_id', riskIds);
    await admin.from('risk_control_links').delete().eq('organisation_id', ORG).in('risk_id', riskIds);
  }
  if (controlIds.length) {
    await admin.from('risk_control_links').delete().eq('organisation_id', ORG).in('control_id', controlIds);
    await admin.from('obligation_control_links').delete().eq('organisation_id', ORG).in('control_id', controlIds);
  }

  if (allEntityIds.length) {
    await admin.from('workflow_events').delete().eq('organisation_id', ORG).in('entity_id', allEntityIds);
  }

  if (riskIds.length) await admin.from('risks').delete().eq('organisation_id', ORG).in('id', riskIds);
  if (controlIds.length) await admin.from('controls').delete().eq('organisation_id', ORG).in('id', controlIds);
  if (oblIds.length) await admin.from('regulatory_obligations').delete().eq('organisation_id', ORG).in('id', oblIds);
  if (impactIds.length) await admin.from('impact_assessments').delete().eq('organisation_id', ORG).in('id', impactIds);
  if (changeIds.length) await admin.from('regulatory_changes').delete().eq('organisation_id', ORG).in('id', changeIds);

  console.log(
    JSON.stringify({
      ok: true,
      prefix: PREFIX,
      removedChanges: changeIds.length,
      removedObligations: oblIds.length,
      removedImpacts: impactIds.length,
      removedRisks: riskIds.length,
      removedControls: controlIds.length,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
