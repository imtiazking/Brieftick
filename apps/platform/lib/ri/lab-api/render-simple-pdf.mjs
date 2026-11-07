/** Minimal single-page PDF (text lines only) — shared with acceptance tests. */

export function renderSimpleTextPdf(lines) {
  const sanitized = lines.map((line) => String(line).replace(/[^\x20-\x7E]/g, '?').slice(0, 120));
  const contentLines = ['BT', '/F1 10 Tf', '50 750 Td'];
  sanitized.forEach((line, i) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    if (i === 0) contentLines.push(`(${escaped}) Tj`);
    else contentLines.push(`0 -14 Td (${escaped}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');
  const streamLen = Buffer.byteLength(stream, 'utf8');

  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export function buildBoardReportPdfLines(params) {
  const periodLine = params.reportingPeriod
    ? `Reporting period (activity filter): ${params.reportingPeriod.label} (${params.reportingPeriod.startDate} to ${params.reportingPeriod.endDate})`
    : 'Reporting period: default (see API period parameter)';
  const lines = [
    'FORGENIQ Regulatory Intelligence — Board Report',
    `Organisation: ${params.organisationId}`,
    `Generated: ${params.generatedAt}`,
    periodLine,
    '',
    'Executive counts (current tenant snapshot — not historical reconstruction):',
    `Open changes: ${params.summary.changesOpen ?? 0}`,
    `Impacts in progress: ${params.summary.impactsInProgress ?? 0}`,
    `Active obligations: ${params.summary.obligationsActive ?? 0}`,
    `Overdue obligations: ${params.summary.obligationsOverdue ?? 0}`,
    `Open findings: ${params.summary.findingsOpen ?? 0}`,
    `Assurance open: ${params.summary.assuranceOpen ?? 0}`,
    `Actions overdue: ${params.summary.actionsOverdue ?? 0}`,
  ];
  if (params.activityInPeriod) {
    lines.push(
      '',
      'Activity registered within reporting period:',
      `Changes registered: ${params.activityInPeriod.changesRegistered ?? 0}`,
      `Impact submissions: ${params.activityInPeriod.impactsSubmitted ?? 0}`,
      `Findings opened: ${params.activityInPeriod.findingsOpened ?? 0}`,
      `Workflow events: ${params.activityInPeriod.workflowEvents ?? 0}`,
    );
  }
  lines.push('', 'Material changes in period (sample):');
  if (!params.materialChanges.length) {
    lines.push('(none matching period filter)');
  } else {
    params.materialChanges.slice(0, 12).forEach((c) => {
      lines.push(`- ${c.title} [${c.materiality ?? '—'}]`);
    });
  }
  lines.push('', 'Traceability: snapshot counts from live tenant rows; period block filters by created/submitted timestamps.');
  lines.push('No compliance score or narrative conclusion is generated.');
  return lines;
}
