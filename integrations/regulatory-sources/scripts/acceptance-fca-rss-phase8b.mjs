#!/usr/bin/env node
/**
 * Phase 8B — FCA RSS date normalisation and pilot item limits (offline).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRssPublicationDate, parseFeedItems } from '../core/rss.mjs';
import { fingerprintContent, normaliseHtmlForFingerprint } from '../core/fingerprint.mjs';
import {
  HTTP_LIMITS,
  resolveConnectorItemLimit,
} from '../core/contract.mjs';
import { CORE_LEGACY_CONNECTORS } from '../connectors/core-legacy-connectors.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`FAIL: ${msg}`);
}

const fcaExample = normalizeRssPublicationDate('Monday, October 26, 2026 - 10:58');
if (fcaExample.publicationDate === '2026-10-26' && fcaExample.sourcePublishedAt?.includes('October 26')) {
  pass('FCA human-readable date → 2026-10-26');
} else {
  fail(`FCA date: ${JSON.stringify(fcaExample)}`);
}

const rfc = normalizeRssPublicationDate('Mon, 26 Oct 2026 09:58:00 GMT');
if (rfc.publicationDate === '2026-10-26') pass('RFC822 GMT date');
else fail(`RFC822: ${JSON.stringify(rfc)}`);

const iso = normalizeRssPublicationDate('2026-10-26');
if (iso.publicationDate === '2026-10-26') pass('ISO date-only');
else fail(`ISO: ${JSON.stringify(iso)}`);

const bad = normalizeRssPublicationDate('not a date');
if (bad.publicationDate === null && bad.sourcePublishedAt === 'not a date') pass('invalid date not invented');
else fail(`bad date: ${JSON.stringify(bad)}`);

const empty = normalizeRssPublicationDate('');
if (empty.publicationDate === null) pass('empty date');
else fail('empty date');

const sampleRss = `<?xml version="1.0"?><rss><channel>
<item><title>A</title><link>https://www.fca.org.uk/a</link><pubDate>Monday, October 26, 2026 - 10:58</pubDate></item>
<item><title>B</title><link>https://www.fca.org.uk/b</link><pubDate>Friday, October 23, 2026 - 10:31</pubDate></item>
</channel></rss>`;
const parsed = parseFeedItems(sampleRss, 5);
if (parsed.length === 2 && parsed[0].publicationDate === '2026-10-26') pass('parseFeedItems normalises pubDate');
else fail(`parseFeedItems: ${JSON.stringify(parsed)}`);

const fcaConnector = CORE_LEGACY_CONNECTORS.find((c) => c.sourceId === 'SRC-FCA-PUBLICATIONS-RSS');
if (!fcaConnector) fail('FCA connector missing');
else {
  if (fcaConnector.maxItems === HTTP_LIMITS.maxItemsPerSource) pass('FCA default maxItems stays 3');
  else fail(`FCA maxItems=${fcaConnector.maxItems}`);
  if (fcaConnector.pilotMaxItems === 5) pass('FCA pilotMaxItems is 5');
  else fail(`FCA pilotMaxItems=${fcaConnector.pilotMaxItems}`);
}

const defaultLimit = resolveConnectorItemLimit(
  { maxItems: 3, pilotMaxItems: 5 },
  {},
);
if (defaultLimit === 3) pass('default run limit 3');
else fail(`default limit ${defaultLimit}`);

const pilotLimit = resolveConnectorItemLimit(
  { maxItems: 3, pilotMaxItems: 5 },
  { maxItems: 5 },
);
if (pilotLimit === 5) pass('pilot run limit 5');
else fail(`pilot limit ${pilotLimit}`);

const capped = resolveConnectorItemLimit(
  { maxItems: 3, pilotMaxItems: 5 },
  { maxItems: 99 },
);
if (capped === 5) pass('pilot cannot exceed cap 5');
else fail(`capped ${capped}`);

const other = resolveConnectorItemLimit({ maxItems: 3, pilotMaxItems: null }, { maxItems: 10 });
if (other === 3) pass('non-pilot connector capped at 3');
else fail(`other ${other}`);

const volatileA = `<html><head><script type="aaa11111111111111-text/javascript"></script></head><body><article><p>FCA body</p></article></body></html>`;
const volatileB = `<html><head><script type="bbb22222222222222-text/javascript"></script></head><body><article><p>FCA body</p></article></body></html>`;
const fpA = await fingerprintContent(volatileA, { contentType: 'text/html' });
const fpB = await fingerprintContent(volatileB, { contentType: 'text/html' });
if (fpA.hash === fpB.hash && fpA.normalisation === 'html_article_v1') {
  pass('HTML fingerprint ignores volatile script type tokens');
} else {
  fail('volatile script normalization');
}

const changed = normaliseHtmlForFingerprint(
  '<article><p>Original regulatory text</p></article>',
);
const changedB = normaliseHtmlForFingerprint(
  '<article><p>Updated regulatory text</p></article>',
);
const h1 = await fingerprintContent(changed, { contentType: 'text/html' });
const h2 = await fingerprintContent(changedB, { contentType: 'text/html' });
if (h1.hash !== h2.hash) pass('HTML fingerprint detects substantive body change');
else fail('substantive change not detected');

if (failed) {
  console.error(`\nacceptance-fca-rss-phase8b: FAIL (${failed})\n`);
  process.exit(1);
}
console.log('\nacceptance-fca-rss-phase8b: PASS\n');
