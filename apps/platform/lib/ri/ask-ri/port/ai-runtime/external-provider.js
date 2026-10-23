import { AI_ERRORS } from './ai-errors.js';

export const EXTERNAL_PROVIDER_ID = 'AIPROV-EXTERNAL-001';

export function createExternalProvider() {
  return {
    id: EXTERNAL_PROVIDER_ID,
    name: 'External AI Provider (production boundary)',
    mode: 'production',
    async execute() {
      return {
        ok: false,
        code: AI_ERRORS.AI_EXTERNAL_PROCESSING_DISABLED,
        message: 'External AI provider is not configured in Design Lab. Production calls must run server-side with secrets.',
      };
    },
  };
}
