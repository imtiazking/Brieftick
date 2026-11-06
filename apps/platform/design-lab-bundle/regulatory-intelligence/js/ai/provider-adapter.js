/**
 * AiProviderAdapter — domain boundary for AI providers (no OpenAI shapes in RI).
 */
export class AiProviderAdapter {
  constructor({ id, mode }) {
    this.id = id;
    this.mode = mode;
  }

  /** @returns {Promise<{ ok: boolean, providerMode: string, structured?: object, errorCode?: string, errorMessage?: string }>} */
  async analyze(_request) {
    throw new Error('analyze() not implemented');
  }
}
