import Link from 'next/link';
import { AccountMenu } from '@/components/account-menu';
import { isClerkConfigured } from '@/lib/env';

const PRODUCTS = [
  { id: 'ri', label: 'Regulatory Intelligence', href: '/ri', active: true },
  { id: 'mi', label: 'Market Intelligence', href: '#', active: false },
  { id: 'fc', label: 'Financial Crime', href: '#', active: false },
  { id: 'or', label: 'Operational Resilience', href: '#', active: false },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const clerkOn = isClerkConfigured();

  return (
    <div className="fg-shell">
      <header className="fg-header">
        <div className="fg-header__brand">
          <Link href="/" className="fg-logo">
            FORGENIQ
          </Link>
          <span className="fg-header__tag">Platform</span>
        </div>
        <nav className="fg-nav" aria-label="Products">
          {PRODUCTS.map((p) =>
            p.active ? (
              <Link key={p.id} href={p.href} className="fg-nav__link fg-nav__link--active">
                {p.label}
              </Link>
            ) : (
              <span key={p.id} className="fg-nav__link fg-nav__link--soon" title="Coming later">
                {p.label}
              </span>
            ),
          )}
        </nav>
        <div className="fg-header__account">
          {clerkOn ? (
            <AccountMenu />
          ) : (
            <span className="fg-pill fg-pill--muted">Auth not configured (local)</span>
          )}
        </div>
      </header>
      {(title || subtitle) && (
        <div className="fg-page-head">
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      <main className="fg-main">{children}</main>
    </div>
  );
}
