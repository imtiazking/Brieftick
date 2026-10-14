const MAP = {
  policy_statement: 'Policy Statement',
  consultation_paper: 'Consultation Paper',
  finalised_guidance: 'Finalised Guidance',
  supervisory_statement: 'Supervisory Statement',
  dear_ceo: 'Dear CEO Letter',
  handbook_update: 'Handbook Update',
  speech: 'Speech',
  regulatory_notice: 'Regulatory Notice',
  news: 'News / Announcement',
};

export function normalizePublicationType(raw) {
  if (!raw) return 'Other';
  const key = String(raw).toLowerCase().replace(/\s+/g, '_');
  if (MAP[key]) return MAP[key];
  const direct = Object.values(MAP).find((v) => v.toLowerCase() === String(raw).toLowerCase());
  return direct || raw;
}

export function isPublicationWorthy(type) {
  const t = normalizePublicationType(type);
  const informational = ['News / Announcement', 'Speech'];
  return !informational.includes(t);
}
