import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { RiValidationError } from '@/lib/ri/errors';
import { isTriageQueue, listTriageQueues } from '@/lib/ri/services/triage-queues';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ai:read');
    const queue = new URL(request.url).searchParams.get('queue');
    if (queue && !isTriageQueue(queue)) throw new RiValidationError('invalid_triage_queue');
    const body = await listTriageQueues(ctx.supabase, ctx.organisationId, queue && isTriageQueue(queue) ? queue : null);
    return NextResponse.json(body);
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
