import { isClerkConfigured, isSupabaseBrowserConfigured } from '@/lib/env';

export function RiDataGate({ children }: { children: React.ReactNode }) {
  const clerk = isClerkConfigured();
  const supabase = isSupabaseBrowserConfigured();

  if (!clerk || !supabase) {
    return (
      <div className="fg-card">
        <h2>RI data access not configured</h2>
        <p>
          Connect Clerk and Supabase (anon URL + key) to use production RI workflows. Local schema
          verification remains available via <code>npm run test:acceptance:phase3a</code>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
