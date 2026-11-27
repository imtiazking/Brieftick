#!/usr/bin/env node
import { ecfrTitle12 } from '../connectors/ecfr-connectors.mjs';

let failed = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`FAIL: ${msg}`);
}

if (!ecfrTitle12.connectorId) fail('connector missing id');
else pass('ecfr connector ids');

const dry = await ecfrTitle12.verify({ liveAllowed: false });
if (dry.publications.length !== 0) fail('dry run should not return publications');
else pass('dry run gated');

const live = await ecfrTitle12.verify({ liveAllowed: true, maxItems: 1 });
if (live.summary.verificationStatus !== 'LIVE_VERIFIED') fail(`live verify ${live.summary.verificationStatus}`);
else pass('eCFR live verify LIVE_VERIFIED');
if (!live.publications[0]?.canonicalUrl?.includes('ecfr.gov')) fail('missing canonical');
else pass('eCFR canonical URL');

process.exit(failed ? 1 : 0);