import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { buildMyTasks, type MyTasksScope } from '@/lib/ri/services/my-tasks';

function parseScope(value: string | null): MyTasksScope {
  return value === 'team' ? 'team' : 'mine';
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const page = url.searchParams.get('page');
    const pageSize = url.searchParams.get('pageSize');
    const scope = parseScope(url.searchParams.get('scope'));
    const viewFilter = url.searchParams.get('viewFilter') || 'OPEN';
    const taskType = url.searchParams.get('taskType') || 'ALL';
    const priority = url.searchParams.get('priority') || 'ALL';
    const search = url.searchParams.get('search') || '';

    const body = await buildMyTasks(ctx.supabase, ctx.organisationId, ctx.userId, ctx.role, {
      scope,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      viewFilter,
      taskType,
      priority,
      search,
    });

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      ...body,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}