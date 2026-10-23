#!/usr/bin/env node
/**
 * Post-deploy smoke checks for staging RI.
 *   STAGING_BASE_URL=https://staging-app.forgeniq.com node scripts/staging/smoke-staging.mjs
 */
const base = (process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
if (!base) {
  console.error('Set STAGING_BASE_URL');
  process.exit(1);
}

const paths = ['/health', '/sign-in', '/ri', '/ri/ask', '/ri/ai', '/ri/ai-governance'];
let fail = 0;
for (const p of paths) {
  const url = `${base}${p}`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const ok = res.status === 200 || res.status === 307 || res.status === 308;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${p} (${res.status})`);
    if (!ok) fail += 1;
  } catch (e) {
    console.log(`FAIL ${p} (${e.message})`);
    fail += 1;
  }
}
process.exit(fail ? 1 : 0);
