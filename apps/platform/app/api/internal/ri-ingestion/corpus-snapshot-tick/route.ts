import { NextResponse } from 'next/server';
import { resolveHostedSchedulerInvocationKind } from '@/lib/ri/ingestion/ops/resolve-scheduler-invocation-kind.mjs';
import {
  planHostedCorpusBackfillInvocation,
  runHostedCorpusBackfillInvocation,
} from '@/lib/ri/ingestion/ops/hosted-corpus-backfill-run.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function extractBearer(request: Request): string | null {
  const h = request.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

export async function GET(request: Request) {
  return handleCorpusRequest(request);
}

export async function POST(request: Request) {
  return handleCorpusRequest(request);
}

async function handleCorpusRequest(request: Request) {
  const { invocationKind, platformSignals } = resolveHostedSchedulerInvocationKind(request);
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

  try {
    if (dryRun) {
      const plan = await planHostedCorpusBackfillInvocation({
        cronSecretFromRequest: extractBearer(request) ?? undefined,
      });
      return NextResponse.json({ ...plan, invocationKind }, { status: 200 });
    }
    const result = await runHostedCorpusBackfillInvocation({
      invocationKind,
      cronSecretFromRequest: extractBearer(request) ?? undefined,
    });
    return NextResponse.json(
      {
        ok: true,
        invocationKind,
        invocationId: result.invocationId,
        attempted: result.attempted,
        remainingWithoutSnapshot: result.remainingWithoutSnapshot,
        terminal_excluded: result.coverage?.terminal_excluded,
        coverage: result.coverage,
        outcomes: result.outcomes,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'corpus_backfill_failed';
    const status =
      message === 'hosted_scheduler_unauthorized'
        ? 401
        : message.startsWith('hosted_scheduler_') || message === 'hosted_scheduler_database_url_missing'
          ? 503
          : 500;
    return NextResponse.json({ ok: false, error: message, invocationKind }, { status });
  }
}