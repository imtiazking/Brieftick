import 'server-only';

import {
  pickActiveOrganisation,
  readActiveOrganisationIdFromCookie,
} from '@/lib/auth/active-organisation';
import { peekClerkJwtClaims } from '@/lib/auth/clerk-jwt-peek';
import { getClerkSupabaseAccessToken } from '@/lib/auth/clerk-supabase-token';
import { queryMembershipsForClerkUser } from '@/lib/auth/membership-query';
import { getOrganisationNames } from '@/lib/auth/memberships';
import { filterActiveMemberships } from '@/lib/auth/tenant-access';
import { requireUser } from '@/lib/auth/session';
import {
  clerkKeyPairAligned,
  FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF,
  getAppEnvironment,
  getClerkPublishableKeyKind,
  getClerkSecretKeyKind,
  getSupabaseProjectRef,
} from '@/lib/env';

export type OrganisationMembershipSummary = {
  organisationId: string;
  organisationName: string | null;
  role: string;
};

function includeStagingDiagnostics(): boolean {
  const env = getAppEnvironment();
  return env === 'staging' || process.env.NODE_ENV !== 'production';
}

export async function buildOrganisationContextPayload() {
  const { userId } = await requireUser();
  const clerkToken = await getClerkSupabaseAccessToken();
  const jwtClaims = peekClerkJwtClaims(clerkToken);

  const membershipQuery = await queryMembershipsForClerkUser(userId);
  const memberships = membershipQuery.ok ? membershipQuery.memberships : [];
  const activeRows = filterActiveMemberships(memberships, userId);
  const names = await getOrganisationNames(activeRows.map((m) => m.organisationId));
  const cookieOrg = await readActiveOrganisationIdFromCookie();
  const picked = pickActiveOrganisation(memberships, userId, cookieOrg);

  let reason = picked.reason ?? null;

  if (!membershipQuery.ok) {
    if (membershipQuery.reason === 'supabase_not_configured') {
      reason = 'supabase_not_configured';
    } else if (membershipQuery.reason === 'postgrest_error') {
      reason = 'membership_query_failed';
    }
  } else if (!clerkToken) {
    reason = clerkKeyPairAligned() ? 'clerk_session_token_missing' : 'clerk_key_pair_mismatch';
  } else if (membershipQuery.ok && membershipQuery.rowCount === 0 && jwtClaims?.sub === userId) {
    reason = 'no_memberships_visible_under_rls';
  } else if (membershipQuery.ok && membershipQuery.rowCount === 0) {
    reason = 'no_memberships';
  }

  const configBlocked =
    !clerkKeyPairAligned() || (!clerkToken && clerkKeyPairAligned());
  const queryFailed = !membershipQuery.ok;

  const payload: Record<string, unknown> = {
    ok: !queryFailed && !configBlocked,
    userId,
    activeOrganisationId: picked.organisationId,
    selectionRequired: picked.selectionRequired,
    reason,
    memberships: activeRows.map((m) => ({
      organisationId: m.organisationId,
      organisationName: names.get(m.organisationId) ?? null,
      role: m.role,
    })),
  };

  if (includeStagingDiagnostics()) {
    const postgrestError = !membershipQuery.ok && membershipQuery.reason === 'postgrest_error'
      ? membershipQuery.error
      : undefined;
    const postgrestTrustFailure =
      postgrestError?.code === 'PGRST301' ||
      (postgrestError?.message?.includes('No suitable key') ?? false);

    let supabaseClerkTrustAssessment: string;
    if (!clerkToken) {
      supabaseClerkTrustAssessment =
        'No Clerk session JWT forwarded to Supabase — fix Clerk key pair or sign-in before inferring third-party auth trust.';
    } else if (membershipQuery.ok && membershipQuery.rowCount > 0) {
      supabaseClerkTrustAssessment =
        'Runtime evidence: PostgREST accepted the session JWT and RLS returned membership rows (third-party auth trust is working for this issuer).';
    } else if (postgrestTrustFailure) {
      supabaseClerkTrustAssessment =
        'PostgREST rejected the session JWT (PGRST301 / JWKS mismatch). Staging may need an additional trusted issuer for localhost Development Clerk — see STAGING-STEP-81B-LOCAL-AUTH.md.';
    } else if (membershipQuery.ok && membershipQuery.rowCount === 0) {
      supabaseClerkTrustAssessment =
        'JWT was accepted by PostgREST but no membership rows visible — provision organisation_memberships or check RLS.';
    } else if (!membershipQuery.ok) {
      supabaseClerkTrustAssessment = `Membership query failed (${membershipQuery.reason}).`;
    } else {
      supabaseClerkTrustAssessment = 'Unable to classify third-party auth trust from current session.';
    }

    payload.diagnostics = {
      supabaseProjectRef: getSupabaseProjectRef(),
      stagingProjectMatch: getSupabaseProjectRef() === FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF,
      clerkPublishableKeyKind: getClerkPublishableKeyKind(),
      clerkSecretKeyKind: getClerkSecretKeyKind(),
      clerkKeyPairAligned: clerkKeyPairAligned(),
      clerkTokenPresent: Boolean(clerkToken),
      clerkJwt: jwtClaims
        ? {
            iss: jwtClaims.iss,
            sub: jwtClaims.sub,
            role: jwtClaims.role,
            subMatchesSessionUser: jwtClaims.sub === userId,
          }
        : null,
      membershipQuery: membershipQuery.ok
        ? { ok: true, rowCount: membershipQuery.rowCount }
        : {
            ok: false,
            reason: membershipQuery.reason,
            error: postgrestError,
          },
      supabaseThirdPartyAuth: {
        documentedProductionClerkIssuer: 'https://clerk.forgeniq.com',
        sessionJwtIssuer: jwtClaims?.iss ?? null,
        postgrestAcceptedJwt: membershipQuery.ok && !postgrestTrustFailure,
        postgrestErrorCode: postgrestError?.code ?? null,
        trustAssessment: supabaseClerkTrustAssessment,
      },
    };
  }

  return payload;
}
