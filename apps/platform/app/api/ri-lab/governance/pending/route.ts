import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { listPendingGovernanceItems } from '@/lib/ri/services/governance-queue';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const pending = await listPendingGovernanceItems(ctx.supabase, ctx.organisationId);
    return NextResponse.json({ ok: true, pending, count: pending.length });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
