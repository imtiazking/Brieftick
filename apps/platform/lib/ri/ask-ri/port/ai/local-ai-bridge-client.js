import { LOCAL_RI_DEV_ORIGIN, LOCAL_AI_BRIDGE_ORIGIN } from './ri-bridge-config.js';

const DEFAULT_BRIDGE = LOCAL_AI_BRIDGE_ORIGIN;

export function getBridgeBaseUrl() {
  if (typeof window !== 'undefined' && window.RI_AI_BRIDGE_BASE_URL) {
    return String(window.RI_AI_BRIDGE_BASE_URL).replace(/\/$/, '');
  }
  return DEFAULT_BRIDGE;
}

export class LocalAiBridgeClient {
  constructor(baseUrl = getBridgeBaseUrl()) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.riOrigin = LOCAL_RI_DEV_ORIGIN;
  }

  async health() {
    const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
    return res.json();
  }

  async analyze(payload) {
    const res = await fetch(`${this.baseUrl}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: this.riOrigin,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }
}
