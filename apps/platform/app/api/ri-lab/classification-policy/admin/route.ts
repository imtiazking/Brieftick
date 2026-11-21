import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { isPlatformOperator, requirePlatformOperator } from '@/lib/auth/platform-operator';
import { RiValidationError } from '@/lib/ri/errors';
import {
  activateClassificationPolicy,
  isClassificationPolicyAdminWriteEnabled,
  loadClassificationPolicyAdmin,
  proposeClassificationPolicy,
  withdrawClassificationPolicy,
  type ProposePolicyInput,
} from '@/lib/ri/services/classification-policy-admin';

/** All versions, entries and (operators only) audit history. Any signed-in member may read. */
export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const operator = await isPlatformOperator(ctx.userId);
    const body = await loadClassificationPolicyAdmin(ctx.supabase, { operator });
    return NextResponse.json({
      ok: true,
      ...body,
      viewerUserId: ctx.userId,
      writesEnabled: isClassificationPolicyAdminWriteEnabled(),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

type AdminAction =
  | ({ action: 'propose' } & ProposePolicyInput)
  | { action: 'activate'; policyId: string }
  | { action: 'withdraw'; policyId: string; reason: string };

/** Operator-only. Propose a DRAFT version, activate another operator's DRAFT, or withdraw a DRAFT. */
export async function POST(request: Request) {
  try {
    if (!isClassificationPolicyAdminWriteEnabled()) {
      return NextResponse.json({ ok: false, error: 'classification_policy_admin_writes_disabled' }, { status: 403 });
    }
    await requirePlatformOperator();
    const ctx = await requireRiContext('ri:read');
    const body = (await request.json().catch(() => null)) as AdminAction | null;
    switch (body?.action) {
      case 'propose':
        return NextResponse.json({ ok: true, ...(await proposeClassificationPolicy(ctx.supabase, body)) });
      case 'activate':
        return NextResponse.json({ ok: true, ...(await activateClassificationPolicy(ctx.supabase, body.policyId)) });
      case 'withdraw':
        return NextResponse.json({
          ok: true,
          ...(await withdrawClassificationPolicy(ctx.supabase, body.policyId, body.reason)),
        });
      default:
        throw new RiValidationError('action_invalid');
    }
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
