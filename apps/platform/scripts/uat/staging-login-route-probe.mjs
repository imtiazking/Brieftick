#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const path = join(dirname(fileURLToPath(import.meta.url)), 'staging-user-sessions.mjs');
const src = readFileSync(path, 'utf8');
const block = src.match(/const ALLOWED_HOSTS = (\[[\s\S]*?\]);/)?.[1];
if (!block) throw new Error('ALLOWED_HOSTS not found');
// eslint-disable-next-line no-eval
const ALLOWED_HOSTS = eval(block);

function hostAllowed(url) {
  if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return true;
  try {
    const { host, protocol } = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

const samples = [
  'https://staging-app.forgeniq.com/sign-in',
  'https://clerk.forgeniq.com/npm/clerk.browser.js',
  'https://staging-app.forgeniq.com/_next/static/chunks/main.js',
];
for (const u of samples) {
  console.log(hostAllowed(u) ? 'ALLOW' : 'BLOCK', u);
}
console.log('regex staging', ALLOWED_HOSTS[0].test('staging-app.forgeniq.com'));