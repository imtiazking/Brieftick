const marks = new Map();

export function perfMark(name) {
  if (typeof performance !== 'undefined' && performance.mark) {
    try {
      performance.mark(`ri:${name}:start`);
    } catch {
      /* ignore */
    }
  }
  marks.set(name, Date.now());
}

export function perfMeasure(name) {
  const start = marks.get(name);
  const end = Date.now();
  const ms = start != null ? end - start : 0;
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      performance.measure(`ri:${name}`, `ri:${name}:start`);
    } catch {
      /* ignore */
    }
  }
  return { name, ms };
}

export function measureSync(name, fn) {
  perfMark(name);
  const result = fn();
  const timing = perfMeasure(name);
  return { result, timing };
}

export async function measureAsync(name, fn) {
  perfMark(name);
  const result = await fn();
  const timing = perfMeasure(name);
  return { result, timing };
}
