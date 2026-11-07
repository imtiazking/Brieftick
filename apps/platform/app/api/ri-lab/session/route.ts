import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { buildLabSessionPayload } from '@/lib/ri/lab-api/session-payload';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    return NextResponse.json(
      buildLabSessionPayload({
        userId: ctx.userId,
        organisationId: ctx.organisationId,
        organisationName: ctx.organisationName,
        role: ctx.role,
      }),
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
