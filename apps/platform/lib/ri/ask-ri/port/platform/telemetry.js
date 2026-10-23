const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let minLevel = LEVELS.warn;

export function setTelemetryLevel(level) {
  if (LEVELS[level] != null) minLevel = LEVELS[level];
}

export function logTelemetry(category, level, message, meta = {}) {
  if (LEVELS[level] == null || LEVELS[level] < minLevel) return;
  const payload = { category, level, message, at: new Date().toISOString(), ...meta };
  if (level === 'error') console.error('[RI]', payload);
  else if (level === 'warn') console.warn('[RI]', payload);
  else if (level === 'info') console.info('[RI]', payload);
  else console.debug('[RI]', payload);
}

export const telemetry = {
  app: (level, msg, meta) => logTelemetry('app', level, msg, meta),
  workflow: (level, msg, meta) => logTelemetry('workflow', level, msg, meta),
  ingestion: (level, msg, meta) => logTelemetry('ingestion', level, msg, meta),
  ai: (level, msg, meta) => logTelemetry('ai', level, msg, meta),
  assurance: (level, msg, meta) => logTelemetry('assurance', level, msg, meta),
  security: (level, msg, meta) => logTelemetry('security', level, msg, meta),
  performance: (level, msg, meta) => logTelemetry('performance', level, msg, meta),
};
