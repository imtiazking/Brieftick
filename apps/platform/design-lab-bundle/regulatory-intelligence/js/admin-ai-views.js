import { getState } from './store.js';
import { esc, pageHeader } from './components.js';
import { LOCAL_AI_BRIDGE_ORIGIN } from './ai/ri-bridge-config.js';
import { RI_SUMMARY_PROMPT_V1 } from './ai/prompt-metadata.js';

export function viewAdminAi() {
  const s = getState();
  const last = (s.riAiAnalysisResults || [])[0];
  const lastErr = (s.aiDomainAuditEvents || []).find(
    (e) => e.type === 'AI_ANALYSIS_FAILED' || e.type === 'AI_VALIDATION_FAILED'
  );

  return `
    ${pageHeader('Admin · AI', 'Design Lab AI status (no secrets)')}
    <section class="ri-panel" data-admin-ai-panel>
      <p class="ri-muted">Bridge: ${esc(LOCAL_AI_BRIDGE_ORIGIN)} · <span data-admin-ai-bridge-status>checking…</span></p>
      <dl class="ri-dl" data-admin-ai-meta>
        <dt>Mode</dt><dd data-admin-ai-mode>—</dd>
        <dt>Provider</dt><dd data-admin-ai-provider>—</dd>
        <dt>Model</dt><dd data-admin-ai-model>—</dd>
        <dt>Prompt</dt><dd>${esc(RI_SUMMARY_PROMPT_V1.promptId)} v${esc(RI_SUMMARY_PROMPT_V1.version)}</dd>
        <dt>Prompt hash</dt><dd class="ri-mono">${esc(RI_SUMMARY_PROMPT_V1.contentHash.slice(0, 16))}…</dd>
        <dt>Schema</dt><dd>${esc(RI_SUMMARY_PROMPT_V1.outputSchemaVersion)}</dd>
        <dt>Disk cache</dt><dd data-admin-ai-cache>—</dd>
        <dt>Last analysis</dt><dd>${last ? esc(last.analysisId) : '—'}</dd>
        <dt>Last error</dt><dd>${lastErr ? esc(lastErr.type) : '—'}</dd>
      </dl>
      <p class="ri-muted">OPENAI_API_KEY and system prompt are never shown here.</p>
    </section>`;
}
