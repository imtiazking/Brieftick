/**
 * Resolve a genuine FCA HTML landing page for FG22/5 (not assumed — probed at ingest time).
 */
import { httpGet } from '../../../../../../integrations/regulatory-sources/core/http-client.mjs';
import {
  FG22_5_PRIMARY_PDF_URL,
} from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { extractDocumentLinks } from '../../../../../../integrations/regulatory-sources/core/document-library.mjs';
import { buildEvidenceCapture } from '../../../../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { fingerprintContent } from '../../../../../../integrations/regulatory-sources/core/fingerprint.mjs';
import { inferFcaPublicationType } from '../../../../../../integrations/regulatory-sources/connectors/fca-publication-type.mjs';

const FCA_HOSTS = ['www.fca.org.uk'];
const CONNECTOR_ID = 'CONN-LEGACY-FCA';

/**
 * Candidate paths — verified at runtime (FCA retired dedicated fg22-5 HTML; PDF remains on allowlist).
 * Prefer Consumer Duty publications-resources (lists FG22/5 primary PDF).
 */
const LANDING_CANDIDATES = [
  'https://www.fca.org.uk/firms/consumer-duty/publications-resources',
  'https://www.fca.org.uk/publications/policy-statements/ps22-9-new-consumer-duty',
  'https://www.fca.org.uk/publication/finalised-guidance/fg22-5',
  'https://www.fca.org.uk/publications/finalised-guidance/fg22-5',
  'https://www.fca.org.uk/publication/finalised-guidance/fg22-5/',
];

const FG22_PDF_PATH = '/publication/finalised-guidance/fg22-5.pdf';

function normaliseUrlForCompare(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let p = u.pathname;
    if (p.endsWith('/')) p = p.slice(0, -1);
    u.pathname = p;
    return u.toString().toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

function pageReferencesFg22Pdf(html, finalUrl) {
  const lower = html.toLowerCase();
  if (lower.includes('fg22/5') || lower.includes('fg22-5') || lower.includes('fg22/ 5')) return true;
  const links = extractDocumentLinks(html, finalUrl, FCA_HOSTS, 24);
  return links.some((l) => l.link.toLowerCase().includes('fg22-5.pdf'));
}

function pageReferencesPrimaryPdf(html, finalUrl) {
  const target = normaliseUrlForCompare(FG22_5_PRIMARY_PDF_URL);
  const links = extractDocumentLinks(html, finalUrl, FCA_HOSTS, 48);
  if (links.some((l) => normaliseUrlForCompare(l.link) === target)) return true;
  return html.toLowerCase().includes(FG22_PDF_PATH);
}

function pickTitleFromHtml(html, fallback) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (m?.[1]) return m[1].replace(/\s+/g, ' ').trim();
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]) return h1[1].replace(/\s+/g, ' ').trim();
  return fallback;
}

/**
 * @returns {Promise<{ ok: true, landingUrl: string, finalUrl: string, evidenceCapture: object, title: string, publicationType: string, contentHash: string, probes: object[] } | { ok: false, code: string, probes: object[] }>}
 */
export async function resolveFg22LandingPage(options = {}) {
  const probes = [];
  const primaryPdfNorm = normaliseUrlForCompare(FG22_5_PRIMARY_PDF_URL);

  for (const candidate of LANDING_CANDIDATES) {
    const res = await httpGet(candidate, { allowedHosts: FCA_HOSTS, maxBytes: 2_000_000 });
    probes.push({
      url: candidate,
      ok: res.ok,
      httpStatus: res.httpStatus ?? null,
      finalUrl: res.finalUrl ?? null,
      contentType: res.contentType ?? null,
      byteLength: res.body?.length ?? 0,
    });
    if (!res.ok || !res.body?.length) continue;
    if (!String(res.contentType || '').toLowerCase().includes('html')) continue;

    const html = res.body.toString('utf8');
    if (!pageReferencesFg22Pdf(html, res.finalUrl || candidate)) {
      probes[probes.length - 1].rejected = 'no_fg22_reference';
      continue;
    }
    if (!pageReferencesPrimaryPdf(html, res.finalUrl || candidate)) {
      probes[probes.length - 1].rejected = 'primary_pdf_link_not_found';
      continue;
    }

    const evidenceCapture = await buildEvidenceCapture({
      body: res.body,
      contentType: res.contentType,
      finalUrl: res.finalUrl || candidate,
      connectorId: CONNECTOR_ID,
    });
    if (!evidenceCapture?.rawBody?.length) {
      probes[probes.length - 1].rejected = 'evidence_capture_failed';
      continue;
    }

    const fp = await fingerprintContent(res.body, { contentType: res.contentType });
    const title =
      pickTitleFromHtml(html, 'FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty') ||
      'FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty';
    const inferred = inferFcaPublicationType({
      title,
      canonicalUrl: res.finalUrl || candidate,
      html,
    });

    return {
      ok: true,
      landingUrl: candidate,
      finalUrl: res.finalUrl || candidate,
      evidenceCapture,
      title,
      publicationType: inferred.publicationType || 'finalised_guidance',
      publicationTypeInference: inferred,
      contentHash: fp.hash,
      probes,
      primaryPdfUrlVerified: primaryPdfNorm,
    };
  }

  const consumerDutyUrl = 'https://www.fca.org.uk/firms/consumer-duty';
  const hub = await httpGet(consumerDutyUrl, { allowedHosts: FCA_HOSTS, maxBytes: 2_000_000 });
  probes.push({
    url: consumerDutyUrl,
    ok: hub.ok,
    httpStatus: hub.httpStatus ?? null,
    finalUrl: hub.finalUrl ?? null,
    purpose: 'fallback_hub_scan',
    hasFg22PdfLink: hub.ok && hub.body ? pageReferencesPrimaryPdf(hub.body.toString('utf8'), hub.finalUrl || consumerDutyUrl) : false,
  });

  if (hub.ok && hub.body && pageReferencesPrimaryPdf(hub.body.toString('utf8'), hub.finalUrl || consumerDutyUrl)) {
    const html = hub.body.toString('utf8');
    const evidenceCapture = await buildEvidenceCapture({
      body: hub.body,
      contentType: hub.contentType,
      finalUrl: hub.finalUrl || consumerDutyUrl,
      connectorId: CONNECTOR_ID,
    });
    if (evidenceCapture?.rawBody?.length) {
      const fp = await fingerprintContent(hub.body, { contentType: hub.contentType });
      const title = pickTitleFromHtml(html, 'Consumer Duty — FCA firms hub (FG22/5 primary PDF linked)');
      const inferred = inferFcaPublicationType({ title, canonicalUrl: hub.finalUrl || consumerDutyUrl, html });
      return {
        ok: true,
        landingUrl: hub.finalUrl || consumerDutyUrl,
        finalUrl: hub.finalUrl || consumerDutyUrl,
        evidenceCapture,
        title,
        publicationType: inferred.publicationType || 'guidance',
        publicationTypeInference: inferred,
        contentHash: fp.hash,
        probes,
        landingKind: 'consumer_duty_hub_with_fg22_pdf_link',
        primaryPdfUrlVerified: primaryPdfNorm,
        warning: 'canonical_landing_paths_returned_404; using FCA Consumer Duty hub that links FG22/5 PDF',
      };
    }
  }

  return {
    ok: false,
    code: 'fg22_landing_not_resolved',
    message:
      'No live FCA HTML page found that references FG22/5 and the allowlisted primary PDF. Cannot create html_article_v2 snapshot without genuine HTML.',
    probes,
  };
}

export const FG22_5_EXPECTED_PRIMARY_PDF_SHA256 =
  'f7f242e8568b4580ca78494541bc6c3d092fd5a7bcdf423714aeb2cf69518afd';
