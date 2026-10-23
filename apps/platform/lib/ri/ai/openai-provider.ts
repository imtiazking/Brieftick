import 'server-only';

import { AI_ERRORS } from '@/lib/ri/ai/errors';

export const OPENAI_PROVIDER_ID = 'AIPROV-OPENAI-001';

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
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
      return {
        ok: false,
        code: AI_ERRORS.AI_EXTERNAL_PROCESSING_DISABLED,
        message: 'OpenAI structured analysis is not enabled in this build — use fixture provider for acceptance.',
      };
    },
  };
}
