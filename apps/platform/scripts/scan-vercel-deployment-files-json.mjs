#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const t = readFileSync(process.argv[2], 'utf8');
const patterns = ['docs/eval', 'eval/runs', 'held-out', 'Claude outputs', 'private-held-out', 'ask-ri-v2-eval'];
for (const p of patterns) console.log(`${p}\t${t.includes(p)}`);
let hits = [];
const re = /"name":"([^"]+)"/g;
let m;
while ((m = re.exec(t))) {
  if (/eval|held-out|Claude/i.test(m[1])) hits.push(m[1]);
}
console.log('nameHits', hits.length);
hits.slice(0, 30).forEach((h) => console.log(h));