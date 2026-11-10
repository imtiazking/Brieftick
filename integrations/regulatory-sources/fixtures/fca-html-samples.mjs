/** Representative FCA HTML fragments for offline regression tests. */

export const COOKIE_CSS_BEFORE_ARTICLE = `<!DOCTYPE html><html><head>
<style>div#sliding-popup, div#sliding-popup .eu-cookie-withdraw-banner {background: #6C1D45}</style>
</head><body>
<article class="node-publication-longform"><div class="field--name-body"><p>Defence SMEs need fair access to banking services across the UK market.</p></div></article>
</body></html>`;

export const DATA_PAGE_ARTICLE = `<html><body>
<article class="node-data"><div class="field--name-body"><p>Flood risk exposure of residential mortgages in England has increased in coastal areas.</p></div></article>
</body></html>`;

export const POLICY_STATEMENT_PAGE = `<html><body><article>
<div class="field--name-field-publication-type"><div class="field__item">Policy statement</div></div>
<p>PS24/1 sets out final rules for operational resilience.</p>
</article></body></html>`;

export const CONSULTATION_PAGE = `<html><body><article>
<div class="field--name-field-publication-type"><div class="field__item">Consultation paper</div></div>
<p>CP24/2 consults on changes to consumer credit rules.</p>
</article></body></html>`;

export const MULTI_FIRM_PAGE = `<html><body><article>
<div class="field--name-field-publication-type"><div class="field__item">Multi-firm review</div></div>
<p>Review of fair treatment in private markets.</p>
</article></body></html>`;

export const CHROME_ONLY = `<html><head><style>.nav{color:red}</style></head><body><header>FCA</header></body></html>`;

/**
 * Representative CP26/38 consultation template (not the stored staging snapshot).
 * Mirrors two sibling articles: timeline slick first, substantive article-header second.
 */
export const CP26_38_CONSULTATION_PAGE = `<!DOCTYPE html><html><body>
<article class="col-sm-12 publication-timeline-slick">
  <div class="publication-timeline__slide in-progress">
    <div class="field-item">Consultation opens</div>
    <div class="publication-timeline__date">23/10/2026</div>
  </div>
  <div class="publication-timeline__slide">
    <div class="field-item">Consultation closes</div>
    <div class="publication-timeline__date">24/12/2026</div>
  </div>
</article>
<article data-history-node-id="176901" class="article-header col-xs-12">
  <article class="publication-timeline-slick">
    <div class="field-item">Consultation opens</div>
    <div class="publication-timeline__date">23/10/2026</div>
  </article>
  <h1>CP26/38: Financial Crime Guide updates</h1>
  <div class="field--name-field-publication-type"><div class="field__item">Consultation papers</div></div>
  <p>We&apos;re consulting on changes to our Financial Crime Guide to help firms strengthen their systems and controls.</p>
  <h2>Why we&apos;re consulting</h2>
  <p>Firms are essential partners in tackling financial crime. We want firms to keep detecting, preventing and disrupting financial crime.</p>
  <h2>Who this is for</h2>
  <p>This consultation is relevant to FCA-authorised firms with financial crime systems and controls obligations.</p>
  <h2>Next steps</h2>
  <p>We will consider responses and publish finalised guidance in due course.</p>
  <a href="https://www.fca.org.uk/publication/consultation/cp26-38.pdf">Read CP26/38 (PDF)</a>
</article>
</body></html>`;
