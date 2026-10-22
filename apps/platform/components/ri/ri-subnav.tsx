import Link from 'next/link';

const LINKS = [
  { href: '/ri', label: 'Overview' },
  { href: '/ri/publications', label: 'Publications' },
  { href: '/ri/changes', label: 'Changes' },
  { href: '/ri/impact-assessments', label: 'Impact' },
  { href: '/ri/obligations', label: 'Obligations' },
] as const;

export function RiSubnav({ active }: { active?: string }) {
  return (
    <nav className="fg-ri-subnav" aria-label="Regulatory Intelligence">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={active === l.href ? 'fg-ri-subnav__link fg-ri-subnav__link--active' : 'fg-ri-subnav__link'}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
