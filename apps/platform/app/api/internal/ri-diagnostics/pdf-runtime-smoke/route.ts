import { NextResponse } from 'next/server';
import { requirePlatformOperator, PlatformOperatorError } from '@/lib/auth/platform-operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Read-only PS26 PDF runtime diagnostic (disabled unless FORGENIQ_PDF_RUNTIME_DIAGNOSTIC=1).
 * Platform operators only; no DB writes, no AI, no ingestion.
 */
export async function GET() {
  if (process.env.FORGENIQ_PDF_RUNTIME_DIAGNOSTIC !== '1') {
    return NextResponse.json({ ok: false, error: 'diagnostic_disabled' }, { status: 404 });
  }

  try {
    await requirePlatformOperator();
  } catch (err) {
    if (err instanceof PlatformOperatorError) {
      return NextResponse.json(
        { ok: false, error: 'forbidden', reason: 'platform_operator_required' },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { runPdfRuntimeSmokeCore } = await import(
    '@/lib/ri/diagnostics/pdf-runtime-smoke-core.mjs'
  );
  const result = await runPdfRuntimeSmokeCore();
  return NextResponse.json({
    ok: result.ok,
    programme: result.programme,
    modules: result.modules,
    pdf: result.pdf,
    guards: result.guards,
    errors: result.errors.length ? result.errors : undefined,
  });
}