import { NextResponse } from 'next/server';
import {
  planHostedSchedulerInvocation,
  runHostedSchedulerInvocation,
} from '@/lib/ri/ingestion/ops/hosted-scheduler-run.mjs';
import { resolveHostedSchedulerInvocationKind } from '@/lib/ri/ingestion/ops/resolve-scheduler-invocation-kind.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Pro plan: allow batched ingest (5 sources × ~60s). Hobby may timeout — see STAGING-PHASE84-HOSTED-SCHEDULER-DEPLOY.md */
export const maxDuration = 300;

function extractBearer(request: Request): string | null {
  const h = request.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

export async function GET(request: Request) {
  return handleSchedulerRequest(request);
}

export async function POST(request: Request) {
  return handleSchedulerRequest(request);
}

async function handleSchedulerRequest(request: Request) {
  const { invocationKind, platformSignals } = resolveHostedSchedulerInvocationKind(request);
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  try {
    if (dryRun) {
      const plan = await planHostedSchedulerInvocation({
        cronSecretFromRequest: extractBearer(request) ?? undefined,
      });
      return NextResponse.json({ ...plan, invocationKind }, { status: 200 });
    }
    const result = await runHostedSchedulerInvocation({
      invocationKind,
      cronSecretFromRequest: extractBearer(request) ?? undefined,
      platformSignals,
    });
    return NextResponse.json(
      {
        ok: true,
        invocationKind,
        invocationId: result.invocationId,
        dueCount: result.dueCount,
        processed: result.outcomes?.length ?? 0,
        staleMarked: result.staleMarked,
        staleRunsRecovered: result.staleRunsRecovered,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'hosted_scheduler_failed';
    const status =
      message === 'hosted_scheduler_unauthorized'
        ? 401
        : message === 'hosted_scheduler_disabled' ||
            message === 'hosted_scheduler_cron_secret_missing_or_weak' ||
            message === 'hosted_scheduler_requires_staging_env' ||
            message === 'hosted_scheduler_phase84_bypass_forbidden' ||
            message === 'hosted_scheduler_wrong_supabase_project' ||
            message === 'hosted_scheduler_database_url_missing'
          ? 503
          : 500;
    return NextResponse.json({ ok: false, error: message, invocationKind }, { status });
  }
}
