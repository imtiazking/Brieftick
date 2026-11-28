#!/usr/bin/env node
/**
 * Product entitlements — R&C APIs allowed with risk_controls only; RI publication APIs blocked.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hook = `
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const root = ${JSON.stringify(pathToFileURL(platformRoot + '/').href)};
    return next(root + (/\\.(m?js|ts|json)$/.test(rel) ? rel : rel + '.ts'), context);
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const { ORG_A, USER_A, applyAllMigrations, applyReferenceSeed, ensureAppRole, resetAndStartEmbedded, stopEmbedded } =
  await import('./local-db/harness.mjs');
const { createPgSupabaseClient } = await import('./local-db/pg-supabase-adapter.mjs');
const { assertOrganisationHasAnyProduct, productsRequiredForRiAction } = await import(
  '../lib/platform/product-entitlements.ts'
);
const { loadOrganisationProductEntitlements } = await import('../lib/platform/product-entitlements.ts');
const { ProductAccessError } = await import('../lib/platform/product-entitlements.ts');
const { listRisks } = await import('../lib/ri/services/risks.ts');

const { embedded, adminUrl } = await resetAndStartEmbedded({ port: 54363 });
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();

try {
  await applyAllMigrations(admin);
  await ensureAppRole(admin);
  await applyReferenceSeed(admin);
  await admin.query(
    `insert into public.organisations (id, name, slug, product_entitlements) values ($1, 'RC only', 'rc-only', '["risk_controls"]'::jsonb) on conflict (id) do update set product_entitlements = excluded.product_entitlements`,
    [ORG_A],
  );
  await admin.query(
    `insert into public.organisation_memberships (organisation_id, clerk_user_id, role, status) values ($1, $2, 'ANALYST'::public.platform_role, 'active') on conflict do nothing`,
    [ORG_A, USER_A],
  );

  const sb = createPgSupabaseClient(adminUrl);
  const entitled = await loadOrganisationProductEntitlements(sb, ORG_A);
  if (entitled.includes('risk_controls') && !entitled.includes('regulatory_intelligence')) {
    console.log('PASS: risk_controls-only entitlement loaded');
  } else {
    throw new Error('entitlement_parse');
  }

  assertOrganisationHasAnyProduct(entitled, productsRequiredForRiAction('risk:read'));
  console.log('PASS: risk:read permitted for RC-only org');

  let blocked = false;
  try {
    assertOrganisationHasAnyProduct(entitled, productsRequiredForRiAction('triage:read'));
  } catch (e) {
    blocked = e instanceof ProductAccessError;
  }
  if (blocked) console.log('PASS: triage:read blocked for RC-only org');
  else throw new Error('expected_product_block');

  await listRisks(sb, ORG_A);
  console.log('PASS: listRisks service callable');
} finally {
  await admin.end();
  await stopEmbedded(embedded);
}