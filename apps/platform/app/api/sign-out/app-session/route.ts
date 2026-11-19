import { NextResponse } from 'next/server';
import { clearActiveOrganisationCookie } from '@/lib/auth/clear-active-org-cookie';

/** Clears FORGENIQ tenant selection cookie before Clerk sign-out (no auth duplicate). */
export async function POST() {
  await clearActiveOrganisationCookie();
  return NextResponse.json({ ok: true });
}
