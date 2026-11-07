export type ReportingPeriodPreset = 'last30' | 'last90' | 'ytd' | 'custom';

export type ReportingPeriod = {
  preset: ReportingPeriodPreset;
  startDate: string;
  endDate: string;
  label: string;
};

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function reportingPeriodFromPreset(preset: ReportingPeriodPreset, now = new Date()): ReportingPeriod {
  const end = formatYmd(now);
  if (preset === 'last30') {
    const start = new Date(now.getTime() - 30 * 86400000);
    return { preset, startDate: formatYmd(start), endDate: end, label: 'Last 30 days' };
  }
  if (preset === 'last90') {
    const start = new Date(now.getTime() - 90 * 86400000);
    return { preset, startDate: formatYmd(start), endDate: end, label: 'Last 90 days' };
  }
  if (preset === 'ytd') {
    const start = `${now.getUTCFullYear()}-01-01`;
    return { preset, startDate: start, endDate: end, label: 'Year to date' };
  }
  return { preset: 'custom', startDate: end, endDate: end, label: 'Custom range' };
}

export function parseReportingPeriod(searchParams: URLSearchParams, now = new Date()): ReportingPeriod {
  const presetRaw = (searchParams.get('period') || searchParams.get('preset') || 'last30').toLowerCase();
  const preset = (['last30', 'last90', 'ytd', 'custom'] as const).includes(presetRaw as ReportingPeriodPreset)
    ? (presetRaw as ReportingPeriodPreset)
    : 'last30';

  const startParam = searchParams.get('startDate') || searchParams.get('from');
  const endParam = searchParams.get('endDate') || searchParams.get('to');

  if (preset === 'custom' && startParam && endParam) {
    return {
      preset: 'custom',
      startDate: startParam.slice(0, 10),
      endDate: endParam.slice(0, 10),
      label: `${startParam.slice(0, 10)} – ${endParam.slice(0, 10)}`,
    };
  }

  return reportingPeriodFromPreset(preset, now);
}

export function periodEndExclusiveIso(endDate: string): string {
  const d = new Date(`${endDate}T23:59:59.999Z`);
  return d.toISOString();
}
