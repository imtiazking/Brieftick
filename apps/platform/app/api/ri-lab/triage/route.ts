import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { RiValidationError } from '@/lib/ri/errors';
import { listTriageQueues } from '@/lib/ri/services/triage-queues';
import {
  isWorkflowQueue,
  resolveWorkflowQueueParam,
} from '@/lib/ri/triage/regulatory-workflow-queues.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ai:read');
    const rawQueue = new URL(request.url).searchParams.get('queue');
    if (rawQueue && !isWorkflowQueue(rawQueue)) throw new RiValidationError('invalid_triage_queue');
    const queue = resolveWorkflowQueueParam(rawQueue);
    const body = await listTriageQueues(ctx.supabase, ctx.organisationId, queue);
    return NextResponse.json(body);
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
