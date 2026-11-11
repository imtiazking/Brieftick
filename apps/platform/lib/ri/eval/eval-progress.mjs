/**
 * Line-oriented eval progress events (stderr) — safe for CI and operator consoles.
 */
export function formatEvalProgressEvent(event) {
  return JSON.stringify({
    type: 'eval_progress',
    ts: new Date().toISOString(),
    ...event,
  });
}

export function emitEvalProgress(event, sink = process.stderr) {
  sink.write(`${formatEvalProgressEvent(event)}\n`);
}
