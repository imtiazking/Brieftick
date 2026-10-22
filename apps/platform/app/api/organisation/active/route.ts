import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/active-organisation';
import { getMembershipsForCurrentUser } from '@/lib/auth/memberships';
import { userCanAccessOrganisation } from '@/lib/auth/tenant-access';
import { requireUser } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const { userId } = await requireUser();
    const body = (await request.json()) as { organisationId?: string };
    const organisationId = body.organisationId?.trim();

    if (!organisationId || !/^[0-9a-f-]{36}$/i.test(organisationId)) {
      return NextResponse.json({ error: 'invalid_organisation_id' }, { status: 400 });
    }

    const memberships = await getMembershipsForCurrentUser();
    if (!userCanAccessOrganisation(memberships, userId, organisationId)) {
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
