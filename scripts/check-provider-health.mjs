/**
 * CLI provider health check (production-safe).
 *
 * Env only (no secret):
 *   node scripts/check-provider-health.mjs https://www.brieftick.com
 *
 * Live probes (requires HEALTH_PROBE_SECRET):
 *   node scripts/check-provider-health.mjs https://www.brieftick.com YOUR_SECRET
 */

const base = (process.argv[2] || 'https://www.brieftick.com').replace(/\/$/, '');
const secret = process.argv[3];
const probe = Boolean(secret);

const url = `${base}/api/proxy?provider=status${probe ? '&probe=1' : ''}`;
const headers = probe ? { 'x-brieftick-health-key': secret } : {};

const res = await fetch(url, { headers });
const data = await res.json();

console.log(`HTTP ${res.status} · probe=${probe} · ${data.at || ''}\n`);

for (const p of data.providers || []) {
  console.log(
    `${p.name.padEnd(14)} env=${p.envPresent ? 'yes' : 'no '}  status=${p.lastTestStatus.padEnd(14)} http=${p.httpStatus ?? '—'}  ${p.message}`
  );
}

if (data.summary) {
  console.log('\nsummary:', data.summary);
}

if (!probe) {
  console.log('\nTip: node scripts/check-provider-health.mjs', base, '<HEALTH_PROBE_SECRET>');
}

process.exit(res.ok ? 0 : 1);
