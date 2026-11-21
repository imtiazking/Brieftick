import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { RiNotFoundError, RiValidationError } from '@/lib/ri/errors';
import { loadActiveClassificationPolicy } from '@/lib/ri/services/classification-policy';

/** Read-only: the active classification policy for a regulator. Policy changes are platform-operator RPCs only. */
export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ai:read');
    const regulator = new URL(request.url).searchParams.get('regulator')?.trim() || 'REG-FCA';
    if (!/^REG-[A-Z0-9-]{2,40}$/.test(regulator)) throw new RiValidationError('regulator_invalid');
    const policy = await loadActiveClassificationPolicy(ctx.supabase, regulator);
    if (!policy) throw new RiNotFoundError('classification_policy_unavailable');
    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
