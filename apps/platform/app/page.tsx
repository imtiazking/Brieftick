import Link from 'next/link';
import { ShellLayout } from '@/components/shell-layout';
import { isClerkConfigured } from '@/lib/env';

export default function HomePage() {
  const authNote = isClerkConfigured()
    ? 'You are using the secured platform shell. Sign in when prompted to access product workspaces.'
    : 'Clerk is not configured in this environment — routes are open for local foundation builds only.';

  return (
    <ShellLayout
      title="FORGENIQ application"
      subtitle="Single authenticated workspace for Regulatory Intelligence, Financial Crime, Operational Resilience and Market Intelligence."
    >
      <div className="fg-card">
        <h2>Welcome</h2>
        <p>
          This is the production platform foundation for{' '}
          <strong>app.forgeniq.com</strong>. Product experiences will mount under dedicated routes;
          Regulatory Intelligence is the first placeholder.
        </p>
        <p>{authNote}</p>
        <p>
          <Link href="/ri">Open Regulatory Intelligence placeholder →</Link>
        </p>
      </div>
    </ShellLayout>
  );
}
