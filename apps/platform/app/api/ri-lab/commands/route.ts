import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';

/** Step 81B — authenticated commands are rejected until workflow migration (81C+). */
export async function POST() {
  try {
    await requireRiContext('ri:read');
    return NextResponse.json(
      {
        error: 'writes_disabled',
        message: 'Connected mode is read-only during Step 81B foundation.',
      },
      { status: 403 },
    );
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
