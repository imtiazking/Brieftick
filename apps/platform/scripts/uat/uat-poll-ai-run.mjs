#!/usr/bin/env node
/**
 * Poll UC-RI-005 run until terminal — exponential backoff to cut staging function invocations.
 */
export const TERMINAL_EXECUTION = new Set(['COMPLETED', 'FAILED', 'VALIDATION_FAILED']);

export function normalizeExecutionStatus(body) {
  const raw =
    body?.detail?.execution_status ??
    body?.aiAnalysisRun?.executionStatus ??
    body?.executionStatus;
  if (!raw) return null;
  return String(raw).trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * @param {(runId: string) => Promise<object>} fetchRun
 */
export async function pollAiAnalysisRun(fetchRun, runId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 360_000;
  const initialDelayMs = options.initialDelayMs ?? 6_000;
  const maxDelayMs = options.maxDelayMs ?? 20_000;
  const backoffFactor = options.backoffFactor ?? 1.45;
  const started = Date.now();
  let delayMs = initialDelayMs;
  let lastBody = null;
  let polls = 0;

  while (Date.now() - started < timeoutMs) {
    if (polls > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    polls += 1;
    lastBody = await fetchRun(runId);
    const status = normalizeExecutionStatus(lastBody);
    if (status && TERMINAL_EXECUTION.has(status)) {
      return { status, body: lastBody, latencyMs: Date.now() - started, polls, lastDelayMs: delayMs };
    }
    delayMs = Math.min(maxDelayMs, Math.round(delayMs * backoffFactor));
  }
  return { status: 'TIMEOUT', body: lastBody, latencyMs: Date.now() - started, polls, lastDelayMs: delayMs };
}

/** Playwright helper */
export async function pollAiAnalysisRunViaPage(page, origin, runId, options = {}) {
  return pollAiAnalysisRun(
    async (id) =>
      (await page.request.get(`${origin}/api/ri-lab/ai-analysis-runs/${id}`, {
        headers: { Accept: 'application/json' },
      })).json().catch(() => ({})),
    runId,
    options,
  );
}