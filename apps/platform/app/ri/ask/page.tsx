import { ShellLayout } from '@/components/shell-layout';
import { RiDataGate } from '@/components/ri/ri-data-gate';
import { RiEmptyState } from '@/components/ri/ri-empty-state';
import { RiSubnav } from '@/components/ri/ri-subnav';
import { tryRiContext } from '@/lib/ri/context';
import { canRi } from '@/lib/ri/permissions';
import { AskRiPanel } from '@/components/ri/ask-ri-panel';

const EXAMPLES = [
  'What changes is the FCA proposing in CP26/38?',
  'What does CP26/38 say about financial crime systems and controls?',
  'What changes are proposed regarding fraud prevention?',
  'Which obligations are overdue?',
  'How many open obligations are there?',
];

export default async function AskRiPage() {
  const ctx = await tryRiContext();
  const allowed = ctx ? canRi(ctx.role, 'ask-ri:read') : false;

  return (
    <ShellLayout
      title="Ask RI"
      subtitle="Evidence-backed answers over your organisation's verified regulatory intelligence records."
    >
      <RiSubnav active="/ri/ask" />
      <RiDataGate>
        {!ctx ? (
          <RiEmptyState title="Sign in required." />
        ) : !allowed ? (
          <RiEmptyState title="Insufficient permissions." />
        ) : (
          <AskRiPanel examples={EXAMPLES} />
        )}
      </RiDataGate>
    </ShellLayout>
  );
}
