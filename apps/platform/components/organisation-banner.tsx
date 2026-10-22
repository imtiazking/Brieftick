import type { ActiveOrganisationContext } from '@/lib/auth/active-organisation';

export function OrganisationBanner({
  active,
  selectionRequired,
}: {
  active: ActiveOrganisationContext | null;
  selectionRequired: boolean;
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
      Current organisation: <strong>{active.organisationName ?? active.organisationId}</strong>
      {active.role ? (
        <>
          {' '}
          · Role: <span className="fg-org-role">{active.role}</span>
        </>
      ) : null}
    </p>
  );
}
