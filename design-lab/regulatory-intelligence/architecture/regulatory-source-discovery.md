# Regulatory source discovery

Date reviewed: **2026-10-08** (Design Lab inspection via public endpoints and official pages).

## Financial Conduct Authority (FCA)

| Field | Finding |
|--------|---------|
| Regulator | Financial Conduct Authority |
| Official domain | `www.fca.org.uk` |
| Documented API | **No public REST API** identified for bulk publication download |
| RSS / Atom | **Yes** — `https://www.fca.org.uk/publications/rss.xml` (publications); separate news feed `https://www.fca.org.uk/news/rss.xml` |
| HTML listings | Publication pages linked from RSS items |
| PDF | Often linked from publication HTML pages |
| Discovery method (recommended) | **Official publications RSS** + per-item HTML/PDF retrieval |
| Retrieval | HTTPS GET (RSS, then item link) |
| Pagination | RSS channel items (recent window) |
| Identifiers observed | Item title, link URL, pubDate; publication reference often in title/path |
| Limitations | RSS is not a guaranteed API; item metadata varies; not all content types in one feed |
| Terms / access | Public read-only access; respectful polling required |
| Connector recommendation | `FCA-RSS-1.0` — RSS discovery + allowlisted retrieval |
| Fallback | Manual backfill with capped date range; fixture mode for tests |
| Date reviewed | 2026-10-08 |

## Prudential Regulation Authority (PRA)

| Field | Finding |
|--------|---------|
| Regulator | PRA (hosted on Bank of England web estate) |
| Official domain | `www.bankofengland.co.uk` |
| Documented API | **No public REST API** identified |
| RSS / Atom | **Yes** — `https://www.bankofengland.co.uk/rss/publications` (all BoE publications) |
| HTML index | Prudential and Resolution Policy Index (navigation hub, not a single feed) |
| PRA Rulebook | Separate rulebook site (rules/guidance corpus; not used as primary poll target in this phase) |
| Discovery method (recommended) | **BoE publications RSS** with **PRA relevance filter** (URL/title heuristics) |
| Retrieval | HTTPS GET |
| Identifiers observed | GUID, link, title, pubDate |
| Limitations | RSS mixes BoE and PRA material — connector must set `regulatoryIdentity: PRA` explicitly |
| Connector recommendation | `PRA-BOE-RSS-1.0` |
| Fallback | Fixture mode; bounded backfill on prudential-regulation paths only (manual) |
| Date reviewed | 2026-10-08 |

## Bank of England (central bank)

| Field | Finding |
|--------|---------|
| Role | Host for PRA publications; broader central bank content |
| Official domain | `www.bankofengland.co.uk` |
| Mechanism | Shared publications RSS (see PRA) |
| Connector | Not duplicated separately unless PRA filter insufficient |
| Trust | Official Regulator / Government (context-dependent) |
| Date reviewed | 2026-10-08 |

## Design Lab principles

- Do **not** describe RSS/HTML retrieval as an “FCA API”.
- Default connector mode: **fixture** (no network).
- Live verification: **manual**, capped, read-only.
