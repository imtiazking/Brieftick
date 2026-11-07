import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { requirePlatformOperator } from '@/lib/auth/platform-operator';
import {
  applyProposedSourceMonitoringConfiguration,
  isSourceMonitoringConfigWriteEnabled,
  validateProposedSourceMonitoringConfiguration,
  type ProposedMonitoringConfiguration,
} from '@/lib/ri/services/source-monitoring-config';

export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'method_not_allowed', detail: 'Use PUT to validate or POST to persist (operator only).' },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  try {
    if (!isSourceMonitoringConfigWriteEnabled()) {
      return NextResponse.json(
        { ok: false, error: 'configuration_writes_disabled' },
        { status: 403 },
      );
    }
    const { userId: operatorUserId } = await requirePlatformOperator();
    const ctx = await requireRiContext('ri:read');
    const body = (await request.json()) as ProposedMonitoringConfiguration;
    const validation = validateProposedSourceMonitoringConfiguration(body);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, validation }, { status: 400 });
    }
    const correlationId =
      request.headers.get('x-correlation-id')?.trim() ||
      request.headers.get('x-request-id')?.trim() ||
      crypto.randomUUID();
    const outcome = await applyProposedSourceMonitoringConfiguration(ctx.supabase, body, {
      operatorUserId,
      correlationId,
    });
    if (!outcome.ok) {
      return NextResponse.json(outcome, { status: 409 });
    }
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

/** Dry-run validation only — never persists or runs ingestion. */
export async function PUT(request: Request) {
  try {
    await requirePlatformOperator();
    await requireRiContext('ri:read');
    const body = (await request.json()) as ProposedMonitoringConfiguration;
    const validation = validateProposedSourceMonitoringConfiguration(body);
    return NextResponse.json({
      ok: validation.ok,
      validation,
      writesEnabled: isSourceMonitoringConfigWriteEnabled(),
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
