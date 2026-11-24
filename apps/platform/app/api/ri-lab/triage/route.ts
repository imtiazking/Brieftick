import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { RiValidationError } from '@/lib/ri/errors';
import { listTriageQueues, type TriageListQuery } from '@/lib/ri/services/triage-queues';
import { normaliseTriagePage, normaliseTriagePageSize } from '@/lib/ri/triage/triage-list-pagination.mjs';
import {
  isWorkflowQueue,
  resolveWorkflowQueueParam,
} from '@/lib/ri/triage/regulatory-workflow-queues.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ai:read');
    const searchParams = new URL(request.url).searchParams;
    const rawQueue = searchParams.get('queue');
    if (rawQueue && !isWorkflowQueue(rawQueue)) throw new RiValidationError('invalid_triage_queue');
    const queue = resolveWorkflowQueueParam(rawQueue);
    const listQuery: TriageListQuery = {
      page: normaliseTriagePage(searchParams.get('page')),
      pageSize: normaliseTriagePageSize(searchParams.get('pageSize')),
      verificationFilter: searchParams.get('verificationFilter')?.trim() || 'ALL',
      approvalFilter: searchParams.get('approvalFilter')?.trim() || 'ALL',
      search: searchParams.get('search')?.trim() || undefined,
    };
    const body = await listTriageQueues(ctx.supabase, ctx.organisationId, queue, listQuery);
    return NextResponse.json(body);
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
