import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const path = join(process.env.LOCALAPPDATA || '', 'forgeniq-uat-sessions', 'uat-agent.env');
if (!existsSync(path)) {
  console.log(JSON.stringify({ ok: false, code: 'missing' }));
  process.exit(1);
}
const raw = readFileSync(path, 'utf8').trim();
const lines = raw.split(/\r?\n/).filter(Boolean);
let secret = process.env.FORGENIQ_HOSTED_CLERK_SECRET_KEY?.trim();
if (!secret) {
  for (const line of lines) {
    const m = line.match(/^FORGENIQ_HOSTED_CLERK_SECRET_KEY\s*=\s*(.+)$/);
    if (m) secret = m[1].trim().replace(/^["']|["']$/g, '');
  }
}
if (!secret && lines.length === 1 && /^sk_/.test(lines[0].trim())) {
  secret = lines[0].trim();
}
if (!secret?.startsWith('sk_')) {
  console.log(JSON.stringify({ ok: false, code: 'no_usable_secret', lineCount: lines.length }));
  process.exit(1);
}
writeFileSync(
  path,
  `# FORGENIQ UAT agent — local only, never commit\nFORGENIQ_HOSTED_CLERK_SECRET_KEY=${secret}\n`,
  'utf8',
);
console.log(JSON.stringify({ ok: true, normalized: true, keyKind: secret.startsWith('sk_live_') ? 'live' : 'test' }));