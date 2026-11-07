import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapAskRiProductionToLabLastAsk } from '@/lib/ri/lab-api/map-ask-ri-to-lab';
import { askRiProduction } from '@/lib/ri/services/ask-ri';

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('ask-ri:read');
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || '').trim();
    if (!question) {
      return NextResponse.json({ ok: false, error: 'empty_question' }, { status: 400 });
    }
    if (question.length > 4000) {
      return NextResponse.json({ ok: false, error: 'question_too_long' }, { status: 400 });
    }

    const result = await askRiProduction(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      question,
    });

    const lastAsk = mapAskRiProductionToLabLastAsk(result);
    return NextResponse.json({
      ok: true,
      lastAsk,
      status: result.status,
      interpretedAs: result.interpretedAs,
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error('[ri-lab/ask-ri]', err.name, err.message);
    } else {
      console.error('[ri-lab/ask-ri]', err);
    }
    return labApiErrorResponse(err);
  }
}

