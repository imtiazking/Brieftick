/**
 * Resolve FORGENIQ Supabase tenant via POST /api/organisation/active (httpOnly cookie).
 * Clerk Organizations are separate — active tenant is always the Supabase UUID membership.
 */

export async function fetchOrganisationContext() {
  const res = await fetch('/api/organisation/active', {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'organisation_context_failed');
    err.status = res.status;
    throw err;
  }
  return body;
}

export async function setActiveOrganisation(organisationId) {
  const res = await fetch('/api/organisation/active', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ organisationId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'organisation_select_failed');
    err.status = res.status;
    throw err;
  }
  return body;
}

/** Ensure forgeniq_active_org cookie is set when the user has exactly one membership. */
export async function ensureSupabaseOrganisationActive() {
  let ctx = await fetchOrganisationContext();
  if (ctx.activeOrganisationId) return ctx;

  if (ctx.reason === 'no_memberships' || ctx.memberships?.length === 0) {
    const err = new Error('no_supabase_membership');
    err.reason = 'no_memberships';
    throw err;
  }

  if (ctx.memberships?.length === 1) {
    await setActiveOrganisation(ctx.memberships[0].organisationId);
    ctx = await fetchOrganisationContext();
    if (ctx.activeOrganisationId) return ctx;
  }

  const err = new Error(ctx.reason || 'organisation_selection_required');
  err.reason = ctx.reason || 'organisation_selection_required';
  err.memberships = ctx.memberships || [];
  throw err;
}

export async function refreshLabOrganisationContext(state) {
  try {
    const ctx = await fetchOrganisationContext();
    state.connectivity = {
      ...(state.connectivity || {}),
      orgMemberships: ctx.memberships,
      orgSelectionRequired: Boolean(ctx.selectionRequired && !ctx.activeOrganisationId),
      activeOrganisationId: ctx.activeOrganisationId,
      clerkUserId: ctx.userId,
    };
    return ctx;
  } catch {
    return null;
  }
}

export function formatOrganisationError(error) {
  const reason = error?.reason || error?.message || '';
  if (reason === 'no_memberships' || reason === 'no_supabase_membership') {
    return (
      'No Supabase organisation membership for this Clerk user. ' +
      'Provision OWNER via staging:bootstrap-ri-owner (STAGING_CLERK_USER_ID). ' +
      'Clerk organisation membership alone does not grant RI tenant access.'
    );
  }
  if (reason === 'organisation_selection_required') {
    return 'Select your active FORGENIQ organisation below, then connect again.';
  }
  if (reason === 'organisation_not_member') {
    return 'That organisation is not in your membership list.';
  }
  return reason || 'Organisation required';
}
