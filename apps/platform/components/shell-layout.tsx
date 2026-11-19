import { AppShell } from '@/components/app-shell';
import { OrganisationBanner } from '@/components/organisation-banner';
import { loadOrganisationShellContext } from '@/lib/auth/require-organisation';
import { loadShellAccountContext } from '@/lib/auth/shell-account-context';

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
  const account = await loadShellAccountContext();

  return (
    <AppShell title={title} subtitle={subtitle} account={account}>
      <OrganisationBanner active={org.active} selectionRequired={org.selectionRequired} email={account?.email ?? null} />
      {children}
    </AppShell>
  );
}
