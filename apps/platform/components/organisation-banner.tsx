import type { ActiveOrganisationContext } from '@/lib/auth/active-organisation';

export function OrganisationBanner({
  active,
  selectionRequired,
  email,
}: {
  active: ActiveOrganisationContext | null;
  selectionRequired: boolean;
  email?: string | null;
}) {
  if (selectionRequired) {
    return (
      <p className="fg-org-banner fg-org-banner--warn">
        Multiple organisations available — select an active organisation (API: POST /api/organisation/active).
      </p>
    );
  }

  if (!active?.organisationId) {
    return (
      <p className="fg-org-banner fg-org-banner--empty">
        No organisation yet. Tenant data will appear here once membership is provisioned in Supabase.
      </p>
    );
  }

  return (
    <p className="fg-org-banner">
      {email ? (
        <>
          Signed in as <span className="fg-org-email">{email}</span>
          {' · '}
        </>
      ) : null}
      Current organisation: <strong>{active.organisationName ?? active.organisationId}</strong>
      <span className="fg-org-id" title="Organisation UUID">
        {' '}
        (<span className="fg-mono">{active.organisationId}</span>)
      </span>
      {active.role ? (
        <>
          {' '}
          · Role: <span className="fg-org-role">{active.role}</span>
        </>
      ) : null}
    </p>
  );
}
