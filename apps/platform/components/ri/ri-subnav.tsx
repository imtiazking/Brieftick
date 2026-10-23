import Link from 'next/link';

const PRIMARY = [
  { href: '/ri', label: 'Dashboard' },
  { href: '/ri/horizon', label: 'Horizon' },
  { href: '/ri/calendar', label: 'Calendar' },
  { href: '/ri/publications', label: 'Publications' },
  { href: '/ri/changes', label: 'Changes' },
  { href: '/ri/impact-assessments', label: 'Impact' },
  { href: '/ri/obligations', label: 'Obligations' },
  { href: '/ri/policies', label: 'Policies' },
  { href: '/ri/risks', label: 'Risks' },
  { href: '/ri/controls', label: 'Controls' },
  { href: '/ri/actions', label: 'Actions' },
  { href: '/ri/evidence', label: 'Evidence' },
  { href: '/ri/findings', label: 'Findings' },
  { href: '/ri/assurance', label: 'Assurance' },
  { href: '/ri/work-queue', label: 'Work Queue' },
  { href: '/ri/landscape', label: 'Landscape' },
] as const;

const SECONDARY = [
  { href: '/ri/reporting', label: 'Reporting' },
  { href: '/ri/governance', label: 'Governance' },
  { href: '/ri/ai', label: 'AI Review' },
  { href: '/ri/ai-governance', label: 'AI Governance' },
  { href: '/ri/ai-operations', label: 'AI Operations' },
  { href: '/ri/admin/sources', label: 'Sources' },
  { href: '/ri/admin/ingestion', label: 'Ingestion' },
  { href: '/ri/admin/alerts', label: 'Alerts' },
] as const;

export function RiSubnav({ active }: { active?: string }) {
  return (
    <div className="fg-ri-nav-wrap">
      <nav className="fg-ri-subnav" aria-label="Regulatory Intelligence">
        {PRIMARY.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              active === l.href || (l.href === '/ri' && active === '/ri')
                ? 'fg-ri-subnav__link fg-ri-subnav__link--active'
                : 'fg-ri-subnav__link'
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <nav className="fg-ri-subnav fg-ri-subnav--secondary" aria-label="RI administration">
        {SECONDARY.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              active === l.href
                ? 'fg-ri-subnav__link fg-ri-subnav__link--active'
                : `fg-ri-subnav__link${'muted' in l && l.muted ? ' fg-ri-subnav__link--soon' : ''}`
            }
            title={'muted' in l && l.muted ? 'COMING IN PHASE 8' : undefined}
          >
            {l.label}
          </Link>
        ))}
        <span className="fg-ri-subnav__link fg-ri-subnav__link--soon" title="COMING LATER — production Ask RI not implemented">
          Ask RI
        </span>
      </nav>
    </div>
  );
}
