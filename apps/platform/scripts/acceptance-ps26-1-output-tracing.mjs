#!/usr/bin/env node
/**
 * Verify Next.js NFT manifests include PS26 PDF runtime files after production build.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const nftPath = join(
  platformDir,
  '.next/server/app/api/ri-lab/ai-analysis-runs/route.js.nft.json',
);

const requiredSubstrings = [
  'integrations/regulatory-sources/core/regulatory-pdf-extract.mjs',
  'integrations/regulatory-sources/core/pdf-physical-page-parser.mjs',
  'integrations/regulatory-sources/core/extraction-quality.mjs',
  'lib/ri/ingestion/snapshot/create-primary-pdf-extraction-revision.mjs',
  'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf',
];

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

if (!existsSync(nftPath)) {
  fail(`missing nft manifest (run npm run build first): ${nftPath}`);
} else {
  ok(`nft manifest present`);
  const raw = readFileSync(nftPath, 'utf8');
  const nft = JSON.parse(raw);
  const files = (nft.files || []).join('\n').replace(/\\/g, '/');
  for (const needle of requiredSubstrings) {
    if (files.includes(needle.replace(/\\/g, '/'))) ok(`traced: ${needle}`);
    else fail(`not traced in ai-analysis-runs nft: ${needle}`);
  }
}

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);