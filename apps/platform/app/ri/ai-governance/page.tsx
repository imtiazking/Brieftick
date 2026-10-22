import { ShellLayout } from '@/components/shell-layout';
import { RiAiPlaceholder } from '@/components/ri/ri-ai-placeholder';
import { RiDataGate } from '@/components/ri/ri-data-gate';

export default function AiGovernancePage() {
  return (
    <ShellLayout title="AI Governance" subtitle="Model and use-case oversight">
      <RiDataGate>
        <RiAiPlaceholder title="AI Governance" phase="Phase 8" />
      </RiDataGate>
    </ShellLayout>
  );
}
