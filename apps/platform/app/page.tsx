import { ShellLayout } from '@/components/shell-layout';
import { HomeProductModules } from '@/components/home-product-modules';
import { loadShellAccountContext } from '@/lib/auth/shell-account-context';
import { isClerkConfigured } from '@/lib/env';

export default async function HomePage() {
  const account = await loadShellAccountContext();
  const authNote = isClerkConfigured()
    ? 'Your available product modules are listed below. Use the account menu to sign out or return here from the Design Lab.'
    : 'Clerk is not configured in this environment — routes are open for local foundation builds only.';

  return (
    <ShellLayout
      title="FORGENIQ"
      subtitle="Authenticated platform home — select a product module to continue."
    >
      <div className="fg-card">
        <h2>Welcome</h2>
        <p>
          This is the staging platform at <strong>staging-app.forgeniq.com</strong>. Authorisation is enforced
          server-side on every protected route and API.
        </p>
        <p>{authNote}</p>
      </div>
      <HomeProductModules account={account} />
    </ShellLayout>
  );
}
