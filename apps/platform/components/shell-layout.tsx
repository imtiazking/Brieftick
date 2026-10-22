import { AppShell } from '@/components/app-shell';
import { OrganisationBanner } from '@/components/organisation-banner';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';

export async function ShellLayout({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const org = await loadOrganisationShellContext();

  return (
    <AppShell title={title} subtitle={subtitle}>
      <OrganisationBanner active={org.active} selectionRequired={org.selectionRequired} />
      {children}
    </AppShell>
  );
}
