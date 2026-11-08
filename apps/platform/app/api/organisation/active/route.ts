import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/active-organisation';
import { buildOrganisationContextPayload } from '@/lib/auth/organisation-api';
import { queryMembershipsForClerkUser } from '@/lib/auth/membership-query';
import { userCanAccessOrganisation } from '@/lib/auth/tenant-access';
import { requireUser } from '@/lib/auth/session';

/** List Supabase tenant memberships and active org cookie state (Clerk session required). */
export async function GET() {
  try {
    const payload = await buildOrganisationContextPayload();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = (await request.json()) as { organisationId?: string };
    const organisationId = body.organisationId?.trim();

    if (!organisationId || !/^[0-9a-f-]{36}$/i.test(organisationId)) {
      return NextResponse.json({ error: 'invalid_organisation_id' }, { status: 400 });
    }

    const membershipQuery = await queryMembershipsForClerkUser(userId);
    if (!membershipQuery.ok) {
      return NextResponse.json(
        {
          error: membershipQuery.reason,
          postgrest: membershipQuery.reason === 'postgrest_error' ? membershipQuery.error : undefined,
        },
        { status: membershipQuery.reason === 'supabase_not_configured' ? 503 : 502 },
      );
    }
    if (!userCanAccessOrganisation(membershipQuery.memberships, userId, organisationId)) {
      return NextResponse.json({ error: 'organisation_not_member' }, { status: 403 });
    }

    const store = await cookies();
    store.set(ACTIVE_ORG_COOKIE, organisationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return NextResponse.json({ ok: true, organisationId });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
