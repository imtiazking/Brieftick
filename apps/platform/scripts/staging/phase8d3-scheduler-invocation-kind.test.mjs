#!/usr/bin/env node
import { resolveHostedSchedulerInvocationKind } from '../../lib/ri/ingestion/ops/resolve-scheduler-invocation-kind.mjs';

function headers(map) {
  return {
    get(name) {
      const key = Object.keys(map).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? map[key] : null;
    },
  };
}

let fail = 0;
function assert(label, cond) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}`);
    fail += 1;
  }
}

const platform = resolveHostedSchedulerInvocationKind({
  headers: headers({
    'user-agent': 'vercel-cron/1.0',
    authorization: 'Bearer secret',
    'x-vercel-cron-schedule': '0 12 * * *',
  }),
});
assert('vercel-cron UA + schedule → VERCEL_CRON', platform.invocationKind === 'VERCEL_CRON');
assert('platformCronDetected', platform.platformSignals.platformCronDetected === true);

const manual = resolveHostedSchedulerInvocationKind({
  headers: headers({
    'user-agent': 'curl/8.0',
    authorization: 'Bearer secret',
  }),
});
assert('curl + Bearer → MANUAL_HOSTED', manual.invocationKind === 'MANUAL_HOSTED');

const legacy = resolveHostedSchedulerInvocationKind({
  headers: headers({ 'x-vercel-cron': '1', authorization: 'Bearer x' }),
});
assert('legacy x-vercel-cron header → VERCEL_CRON label', legacy.invocationKind === 'VERCEL_CRON');

const spoofUaOnly = resolveHostedSchedulerInvocationKind({
  headers: headers({ 'user-agent': 'vercel-cron/1.0' }),
});
assert('spoof UA without Bearer still VERCEL_CRON label (auth separate)', spoofUaOnly.invocationKind === 'VERCEL_CRON');

process.exit(fail ? 1 : 0);
