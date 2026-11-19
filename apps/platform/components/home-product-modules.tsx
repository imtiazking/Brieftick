import Link from 'next/link';
import { canRi } from '@/lib/ri/permissions';
import type { ShellAccountContext } from '@/lib/auth/shell-account-context';
import type { PlatformRole } from '@/lib/roles';

import { REGULATORY_INTELLIGENCE_DESIGN_LAB_ENTRY } from '@/lib/platform-routing';

const RI_LAB_HREF = REGULATORY_INTELLIGENCE_DESIGN_LAB_ENTRY;

type ModuleDef = {
  id: string;
  title: string;
  description: string;
  available: boolean;
  href?: string;
  reason?: string;
};

function modulesForRole(role: PlatformRole | null, hasOrganisation: boolean): ModuleDef[] {
  const riAvailable = hasOrganisation && canRi(role, 'ri:read');

  return [
    {
      id: 'ri',
      title: 'Regulatory Intelligence',
      description: 'Connected Design Lab — live tenant catalogue, triage, and compliance workflows.',
      available: riAvailable,
      href: RI_LAB_HREF,
      reason: !hasOrganisation
        ? 'Organisation membership required'
        : !canRi(role, 'ri:read')
          ? 'Insufficient role for Regulatory Intelligence'
          : undefined,
    },
    {
      id: 'mi',
      title: 'Market Intelligence',
      description: 'Cross-market surveillance and horizon scanning.',
      available: false,
      reason: 'Not yet released',
    },
    {
      id: 'fc',
      title: 'Financial Crime',
      description: 'AML, fraud, and financial crime compliance.',
      available: false,
      reason: 'Not yet released',
    },
    {
      id: 'or',
      title: 'Operational Resilience',
      description: 'Impact tolerances, mapping, and testing.',
      available: false,
      reason: 'Not yet released',
    },
  ];
}

export function HomeProductModules({ account }: { account: ShellAccountContext | null }) {
  const hasOrganisation = Boolean(account?.organisationId);
  const role = account?.role ?? null;
  const modules = modulesForRole(role, hasOrganisation);

  return (
    <section className="fg-module-grid" aria-labelledby="fg-products-heading">
      <h2 id="fg-products-heading">Product modules</h2>
      <p className="fg-module-grid__intro">
        Modules shown here reflect your current organisation and role. Authorisation is enforced on every API route.
      </p>
      <ul className="fg-module-grid__list">
        {modules.map((mod) => (
          <li key={mod.id} className={`fg-module-card${mod.available ? '' : ' fg-module-card--unavailable'}`}>
            <h3>{mod.title}</h3>
            <p>{mod.description}</p>
            {mod.available && mod.href ? (
              <Link href={mod.href} className="fg-module-card__cta">
                Open module →
              </Link>
            ) : (
              <p className="fg-module-card__status" aria-live="polite">
                {mod.reason ?? 'Unavailable'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
