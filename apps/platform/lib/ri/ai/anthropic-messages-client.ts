import 'server-only';

import {
  callAnthropicMessages as callCore,
  mapAnthropicHttpFailure,
  parseAnthropicJsonText,
} from '@/lib/ri/ai/anthropic-messages-core.mjs';

export type AnthropicMessagesRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
};

export type AnthropicMessagesSuccess = {
  ok: true;
  text: string;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AnthropicMessagesFailure = {
  ok: false;
  code: string;
  message: string;
  httpStatus?: number;
};

export type AnthropicMessagesResult = AnthropicMessagesSuccess | AnthropicMessagesFailure;

export { parseAnthropicJsonText, mapAnthropicHttpFailure };

export async function callAnthropicMessages(
  apiKey: string,
  req: AnthropicMessagesRequest,
  deps?: { fetchFn?: typeof fetch },
): Promise<AnthropicMessagesResult> {
  return callCore(apiKey, req, deps) as Promise<AnthropicMessagesResult>;
}
