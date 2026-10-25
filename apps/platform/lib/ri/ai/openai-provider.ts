import 'server-only';

import { AI_ERRORS } from '@/lib/ri/ai/errors';
import { isRiAiExecutionEnabled } from '@/lib/ri/ai/ri-ai-execution';

export const OPENAI_PROVIDER_ID = 'AIPROV-OPENAI-001';

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function validateOpenAiApiKeyFormat(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return false;
  return (key.startsWith('sk-') || key.startsWith('sk-proj-')) && key.length >= 20;
}

export function createOpenAiProvider() {
  return {
    id: OPENAI_PROVIDER_ID,
    name: 'OpenAI (server-side)',
    mode: 'openai' as const,
    configured: isOpenAiConfigured(),
    async execute() {
      if (!isOpenAiConfigured()) {
        return {
          ok: false,
          code: AI_ERRORS.AI_PROVIDER_NOT_CONFIGURED,
          message: 'AI provider not configured.',
        };
      }
      if (!isRiAiExecutionEnabled()) {
        return {
          ok: false,
          code: AI_ERRORS.AI_EXTERNAL_PROCESSING_DISABLED,
          message: 'Live OpenAI execution is disabled (RI_AI_EXECUTION_ENABLED is not true).',
        };
      }
      return {
        ok: false,
        code: AI_ERRORS.AI_EXTERNAL_PROCESSING_DISABLED,
        message: 'OpenAI structured analysis is not implemented in RI — use Anthropic or fixture.',
      };
    },
  };
}
