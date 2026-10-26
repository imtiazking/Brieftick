import { extractPrimaryContentHtml, stripHtmlToPlainText } from '../core/html-publication-text.mjs';

/**
 * Evidence-based FCA publication_type (FORGENIQ snake_case taxonomy).
 * Defaults to `publication` when a specific type cannot be justified.
 *
 * @param {{ title?: string, canonicalUrl?: string, html?: string }} input
 * @returns {{ publicationType: string, publicationTypeInference: { method: string, signal: string } }}
 */
export function inferFcaPublicationType(input = {}) {
  const title = input.title ?? '';
  const canonicalUrl = input.canonicalUrl ?? '';
  const html = input.html ?? '';

  const pageLabel = extractFcaPublicationTypeLabel(html);
  if (pageLabel) {
    const mapped = mapFcaPageLabelToType(pageLabel);
    if (mapped) {
      return {
        publicationType: mapped.publicationType,
        publicationTypeInference: { method: 'fca_page_metadata', signal: mapped.signal },
      };
    }
  }

  const fromUrl = inferFromFcaUrl(canonicalUrl);
  if (fromUrl) {
    return {
      publicationType: fromUrl.publicationType,
      publicationTypeInference: { method: 'fca_url_path', signal: fromUrl.signal },
    };
  }

  const fromTitle = inferFromFcaTitle(title);
  if (fromTitle) {
    return {
      publicationType: fromTitle.publicationType,
      publicationTypeInference: { method: 'fca_title', signal: fromTitle.signal },
    };
  }

  return {
    publicationType: 'publication',
    publicationTypeInference: { method: 'default', signal: 'unclassified' },
  };
}

function extractFcaPublicationTypeLabel(html) {
  if (!html) return null;
  const region = extractPrimaryContentHtml(html) ?? html;
  const field =
    region.match(/field--name-field-publication-type[\s\S]*?<\/(?:div|dd)>/i)?.[0] ||
    region.match(/Publication type[\s\S]{0,200}?<\/(?:div|span|p)>/i)?.[0];
  if (!field) return null;
  const text = stripHtmlToPlainText(field).replace(/^Publication type\s*/i, '').trim();
  return text.length >= 2 && text.length <= 120 ? text : null;
}

function mapFcaPageLabelToType(label) {
  const l = label.toLowerCase();
  if (l.includes('policy statement')) {
    return { publicationType: 'policy_statement', signal: `page_label:policy_statement` };
  }
  if (l.includes('consultation paper') || l.includes('discussion paper')) {
    return { publicationType: 'consultation_paper', signal: `page_label:consultation_paper` };
  }
  if (l.includes('finalised guidance')) {
    return { publicationType: 'finalised_guidance', signal: `page_label:finalised_guidance` };
  }
  if (l.includes('supervisory statement')) {
    return { publicationType: 'supervisory_statement', signal: `page_label:supervisory_statement` };
  }
  if (l.includes('dear ceo')) {
    return { publicationType: 'dear_ceo', signal: `page_label:dear_ceo` };
  }
  if (l.includes('multi-firm') || l.includes('multi firm')) {
    return { publicationType: 'publication', signal: `page_label:multi_firm_review` };
  }
  if (l.includes('data') || l.includes('statistic')) {
    return { publicationType: 'publication', signal: `page_label:statistical_data` };
  }
  return null;
}

function inferFromFcaUrl(canonicalUrl) {
  const u = String(canonicalUrl).toLowerCase();
  if (!u.includes('fca.org.uk')) return null;
  if (u.includes('/data/')) {
    return { publicationType: 'publication', signal: 'url_path:data_statistics' };
  }
  if (u.includes('/publications/multi-firm-reviews/')) {
    return { publicationType: 'publication', signal: 'url_path:multi_firm_reviews' };
  }
  if (u.includes('/publications/consultation') || u.includes('/consultation-paper')) {
    return { publicationType: 'consultation_paper', signal: 'url_path:consultation' };
  }
  if (u.includes('/publications/policy/') || /\/ps\d{2}/i.test(u)) {
    return { publicationType: 'policy_statement', signal: 'url_path:policy_statement' };
  }
  if (u.includes('/publications/finalised-guidance') || u.includes('/fg')) {
    return { publicationType: 'finalised_guidance', signal: 'url_path:finalised_guidance' };
  }
  return null;
}

function inferFromFcaTitle(title) {
  const t = String(title).toLowerCase();
  if (t.includes('consultation paper') || /\bcp\d{2}\b/.test(t)) {
    return { publicationType: 'consultation_paper', signal: 'title:consultation_paper' };
  }
  if (t.includes('policy statement') || /\bps\d{2}\b/.test(t)) {
    return { publicationType: 'policy_statement', signal: 'title:policy_statement' };
  }
  if (t.includes('finalised guidance') || /\bfg\d{2}\b/.test(t)) {
    return { publicationType: 'finalised_guidance', signal: 'title:finalised_guidance' };
  }
  if (t.includes('supervisory statement') || /\bss\d{2}\b/.test(t)) {
    return { publicationType: 'supervisory_statement', signal: 'title:supervisory_statement' };
  }
  return null;
}
