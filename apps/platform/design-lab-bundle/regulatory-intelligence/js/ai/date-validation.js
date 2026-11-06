const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function normalizeDateToken(token) {
  if (!token) return null;
  const t = String(token).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (dmy) {
    const m = MONTHS[dmy[2].toLowerCase()];
    if (!m) return null;
    return `${dmy[3]}-${String(m).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return null;
}

export function dateSupportedInContext(claimedDate, contextTexts) {
  const norm = normalizeDateToken(claimedDate);
  if (!norm) return { ok: false, unsupported: true };
  const hay = contextTexts.join(' ');
  const variants = [
    claimedDate,
    norm,
    norm.replace(/-/g, '/'),
    norm.split('-').reverse().join('/'),
  ];
  const supported = variants.some((v) => hay.includes(v));
  return { ok: supported, normalized: norm, unsupported: !supported };
}
