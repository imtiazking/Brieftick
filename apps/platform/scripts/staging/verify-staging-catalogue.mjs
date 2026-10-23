#!/usr/bin/env node
/**
 * Phase 8A acceptance: compare staging DB catalogue to packages/reference-data.
 * Requires SUPABASE_ACCESS_TOKEN. Targets SUPABASE_PROJECT_REF (default staging).
 */
import { REGULATORS, REGULATORY_SOURCES } from '../../../../packages/reference-data/index.mjs';

const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'lhgzdicffkhaaykzthep';
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(body);
  return JSON.parse(body);
}

const canonicalReg = new Set(REGULATORS.map((r) => r.regulatorId));
const canonicalSrc = new Set(REGULATORY_SOURCES.map((s) => s.sourceId));
const urlBySrc = new Map(
  REGULATORY_SOURCES.map((s) => [
    s.sourceId,
    s.integration?.canonicalRegulatoryContentUrl ?? s.officialBaseUrl ?? null,
  ]),
);
const urlByReg = new Map(REGULATORS.map((r) => [r.regulatorId, r.officialBaseUrl]));

const checks = [
  `select count(*)::int as n from public.regulators`,
  `select count(*)::int as n from public.regulatory_sources`,
  `select count(*)::int as n from public.regulatory_sources rs left join public.regulators r on r.id = rs.regulator_id where r.id is null`,
  `select count(*)::int as n from (select external_key from public.regulators group by 1 having count(*)>1) d`,
  `select count(*)::int as n from (select external_key from public.regulatory_sources group by 1 having count(*)>1) d`,
  `select count(*)::int as n from public.regulatory_sources where production_status::text <> 'NOT_ENABLED'`,
  `select external_key, official_base_url from public.regulators order by external_key`,
  `select external_key, canonical_url from public.regulatory_sources order by external_key`,
];

let fail = 0;
const [[{ n: regCount }], [{ n: srcCount }], [{ n: orphans }], [{ n: dupReg }], [{ n: dupSrc }], [{ n: notDisabled }], regRows, srcRows] =
  await Promise.all(checks.map((sql) => q(sql)));

const passCount = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` → ${detail}` : ''}`);
  if (!ok) fail += 1;
};

passCount('Regulators 36/36', regCount === 36, regCount);
passCount('Sources 41/41', srcCount === 41, srcCount);
passCount('Source relationships', orphans === 0, `orphans=${orphans}`);
passCount('Duplicate regulators', dupReg === 0, dupReg);
passCount('Duplicate sources', dupSrc === 0, dupSrc);
passCount('Source status NOT_ENABLED', notDisabled === 0, `non_NOT_ENABLED=${notDisabled}`);

const dbReg = new Set(regRows.map((r) => r.external_key));
const dbSrc = new Set(srcRows.map((r) => r.external_key));
const missingReg = [...canonicalReg].filter((k) => !dbReg.has(k));
const extraReg = [...dbReg].filter((k) => !canonicalReg.has(k));
const missingSrc = [...canonicalSrc].filter((k) => !dbSrc.has(k));
const extraSrc = [...dbSrc].filter((k) => !canonicalSrc.has(k));

passCount('Canonical regulator keys', missingReg.length === 0 && extraReg.length === 0, `missing=${missingReg.length} extra=${extraReg.length}`);
passCount('Canonical source keys', missingSrc.length === 0 && extraSrc.length === 0, `missing=${missingSrc.length} extra=${extraSrc.length}`);

const urlMismatches = [];
for (const row of regRows) {
  const expected = urlByReg.get(row.external_key);
  if (expected && row.official_base_url !== expected) urlMismatches.push(row.external_key);
}
for (const row of srcRows) {
  const expected = urlBySrc.get(row.external_key);
  if (expected && row.canonical_url !== expected) urlMismatches.push(row.external_key);
}
passCount('Canonical URLs', urlMismatches.length === 0, urlMismatches.slice(0, 5).join(', ') || 'ok');

if (urlMismatches.length) fail += 1;
console.log(fail ? '\nCatalogue integrity: FAIL' : '\nCatalogue integrity: PASS');
process.exit(fail ? 1 : 0);
