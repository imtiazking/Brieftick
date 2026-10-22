export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';

export default async function RiAdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireIngestionAdminContext();
  } catch {
    redirect('/ri');
  }
  return (
    <div className="fg-ri-admin">
      <p className="fg-banner">Ingestion admin — TEST / MANUAL operations only. Production scheduling is not enabled.</p>
      {children}
    </div>
  );
}
