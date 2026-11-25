import { config } from 'dotenv';
import { join } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { expectedStagingClerkInstanceId, assertStagingClerkInstanceId } from '../../lib/ri/ingestion/snapshot/staging-clerk-session-auth.mjs';

const agentEnv = join(process.env.LOCALAPPDATA || '', 'forgeniq-uat-sessions', 'uat-agent.env');
config({ path: agentEnv });
const sk = process.env.FORGENIQ_HOSTED_CLERK_SECRET_KEY?.trim();
if (!sk?.startsWith('sk_')) {
  console.log(JSON.stringify({ ok: false, code: 'missing_or_invalid_secret_shape' }));
  process.exit(1);
}
const clerk = createClerkClient({ secretKey: sk });
const instance = await clerk.instance.get();
try {
  assertStagingClerkInstanceId(instance);
  console.log(JSON.stringify({ ok: true, instanceId: instance.id, matchesStaging: true }));
} catch {
  console.log(JSON.stringify({ ok: false, code: 'instance_mismatch', got: instance.id, expected: expectedStagingClerkInstanceId() }));
  process.exit(1);
}