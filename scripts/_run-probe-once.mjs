import { readFileSync, unlinkSync } from 'fs';

const envPath = '.env.health.probe';
const env = readFileSync(envPath, 'utf8');
const line = env.split(/\r?\n/).find((l) => l.startsWith('HEALTH_PROBE_SECRET='));
const secret = line ? line.slice('HEALTH_PROBE_SECRET='.length).trim().replace(/^["']|["']$/g, '') : '';

if (secret.length < 8) {
  console.error('SECRET_INVALID_LEN', secret.length);
  process.exit(2);
}

const res = await fetch('https://www.forgeniq.com/api/proxy?provider=status&probe=1', {
  headers: { 'x-brieftick-health-key': secret },
});
const data = await res.json();

try {
  unlinkSync(envPath);
} catch {
  /* ignore */
}

if (!data.probeAuthorized) {
  console.error('PROBE_DENIED', res.status, data.message || data.error);
  process.exit(1);
}

for (const p of data.providers || []) {
  console.log(
    [p.id, p.lastTestStatus, p.httpStatus ?? '', (p.message || '').replace(/\|/g, '/')].join('|')
  );
}
if (data.summary) console.log('SUMMARY|' + JSON.stringify(data.summary));
console.log('AT|' + (data.at || ''));
