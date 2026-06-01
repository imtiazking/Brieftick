# Movers → Intelligence Wheel mapping audit

**Date:** 2026-06-01  
**Scope:** Relationship between legacy market intelligence surfaces and the preview **Intelligence Wheel** (`/dashboard-preview`, `preview/dashboard-rail-mocks.js`).  
**Method:** Static codebase audit only — no runtime or design changes.

---

## 1. What “legacy Movers” means in this repo

The codebase has **two related but separate** “movers” experiences:

| Surface | Location | Role |
|--------|----------|------|
| **Live Dashboard** | `index.html` → `#page-dashboard` | Multi-panel “Live Market Intelligence” grid (Top Movers list, heatmap, VIX, flows, etc.). Still the default in-app dashboard on production until preview routing sends users to the wheel. |
| **Why Is It Moving (WIM)** | `index.html` → `#page-why` | Ticker-level “movers” intelligence: search a symbol and decompose *why* it is moving. Hosts the four named submodules below. |

The five buckets **WHY · DRIVERS · REACTION · PATTERNS · SENTIMENT** are **not** literal wheel channel labels in code. They match the **analytical layers** on the WIM page (and product language around “why stocks move”). The Intelligence Wheel instead uses **investor-friendly channel names** defined in `WHEEL_SECTIONS` / `WHEEL_LABELS` (`preview/dashboard-rail-mocks.js`).

---

## 2. Intelligence Wheel channels (current preview)

| Wheel label (UI) | Module `id` | Legacy code | Primary preview implementation |
|------------------|---------------|-------------|--------------------------------|
| **Movers** | `movers` | Dashboard panel **01** | `renderMovers()` + `dashboard-movers-intel.js` |
| **Sectors** | `heatmap` | Dashboard panel **02** | `renderHeatmap()` + sector flip cards |
| **Market Risk** | `volatility` | Dashboard panels **03** + **04** (partial) | `renderVolatility()` + `market-mood.js` |
| **Money Flow** | `flows` | Dashboard panel **07** (flow engine) | `heroFlowMap()` + `flow-bubble-detail.js` |
| **Opportunities** | `signals` | Dashboard panel **06** | `heroSignalPulse()` |
| **News** | `news` | Dashboard panel **10** | `dashboard-news-narrative.js` |
| **Moves Together** | `correlation` | Dashboard panel **09** (matrix) | `dashboard-moves-network.js` (influence ring) |
| **What Matters** | `alerts` | Dashboard panel **S1** | `renderAlerts()` |
| **Watchlist** | `watchlist` | Dashboard panel **05** | `dashboard-preview-watchlist.js` |
| **Summary** | `session` | Dashboard panel **08** | `dashboard-preview-briefing.js` (wheel overrides `renderSession`) |

**Market Pulse** (strip above the wheel) maps to legacy dashboard narrative / regime copy (`RAIL_PULSE`), not a separate legacy panel.

---

## 3. WIM analytical layers → Wheel migration

### 3.1 WHY (plain-English “why is it moving”)

| Legacy source | Migrated into wheel? | Wheel destination | Notes |
|---------------|----------------------|-------------------|--------|
| WIM hero **Plain-English Summary** (`#wimSummary`, `wimDB[].summary`) | **Partial** | **Movers** (lead + “Why it matters”), **News** (what/why blocks), **Summary** (today’s story), **Market Risk** (plain English + current summary) | No ticker search; market-wide mock copy only. |
| WIM search + quote header | **No** | — | Wheel has no per-ticker WIM entry point. |
| Dashboard movers list narrative | **Yes** | **Movers** | List + story panel replaces `#moversList` UX. |

### 3.2 DRIVERS (causal decomposition & session drivers)

| Legacy source | Migrated into wheel? | Wheel destination | Notes |
|---------------|----------------------|-------------------|--------|
| WIM **Movement Decomposition** (`#wimReasons`, weighted reason rows) | **No** | — | No ranked attribution list on the wheel. |
| Dashboard **Risk Regime** components + explanation | **Partial** | **Market Risk** | Mood zones + “What This Usually Means” / optional Why panel; not the old 4-bar component UI. |
| Dashboard **Signal Intelligence Feed** | **Yes** | **Opportunities** | Thematic signal bars (mock). |
| Dashboard **Sector Heatmap** drivers | **Yes** | **Sectors** | Flip cards: what / why / examples per sector. |
| Pulse **Key driver / Key risk** | **Yes** | **Market Pulse** strip + **Summary** | Editorial session framing. |
| Dashboard **Macro Event Tracker** | **No** | — | Not a wheel channel (design-lab deck mock `events` only). |
| Dashboard **AI Flow Engine** narrative cards | **Partial** | **Money Flow** | Bubble map + industry detail panels; different visual model. |

### 3.3 REACTION (who moves with whom / contagion)

| Legacy source | Migrated into wheel? | Wheel destination | Notes |
|---------------|----------------------|-------------------|--------|
| WIM **Market Reaction Map** (`#contagionSvg`, `drawContagion`) | **Partial** | **Moves Together** | Ring explores *leader → peers*; not ticker-centric contagion from a searched symbol. No breadcrumb trail / re-center-from-WIM behavior. |
| Dashboard **Correlation Engine** (30D matrix, `#corrMatrix`) | **Replaced** | **Moves Together** | Matrix UI retired on wheel; ring is the preview correlation surface. |
| Dashboard **Market Impact Feed** chain framing | **Partial** | **News** / **What Matters** | Event copy, not interactive contagion graph. |

### 3.4 PATTERNS (historical analogues)

| Legacy source | Migrated into wheel? | Wheel destination | Notes |
|---------------|----------------------|-------------------|--------|
| WIM **Historical Pattern Comparisons** (`#wimHistory`, `drawHistory`) | **No** | — | Analogue cards and historical drawdown language remain WIM-only. |
| References in WIM summary text (“historically…”) | **Partial** | **Summary** / **Movers** copy only | Narrative mention, not interactive pattern UI. |

### 3.5 SENTIMENT (positioning & mood)

| Legacy source | Migrated into wheel? | Wheel destination | Notes |
|---------------|----------------------|-------------------|--------|
| WIM **Market Positioning** (institutional %ile, retail, short interest, IV rank, skew) | **No** | — | Bar chart block is not replicated on the wheel. |
| Dashboard **Volatility Monitor** (VIX gauge) | **Replaced** | **Market Risk** | VIX-style gauge → **Market Mood** arc + risk score / zones. |
| Dashboard **Signal Intelligence Feed** (news sentiment headlines) | **Partial** | **Opportunities** | Headline sentiment ≠ positioning percentiles. |
| AI sentiment feed logic (`index.html`, `NEWS_SENTIMENT`) | **No** (on wheel) | — | Still powers legacy dashboard when that page is shown. |

---

## 4. Legacy dashboard panels → Wheel (full grid)

| Legacy panel (`#page-dashboard`) | On Intelligence Wheel? | Wheel channel | Status |
|----------------------------------|--------------------------|---------------|--------|
| 01 Top Movers · S&P 500 | Yes | Movers | Redesigned list + story panel |
| 02 Sector Heatmap | Yes | Sectors | Interactive sector cards |
| 03 Volatility Monitor | Yes (redesigned) | Market Risk | Market Mood gauge |
| 04 Risk Regime | Partial | Market Risk | Merged into mood/risk UX; separate risk bar UI not on wheel |
| 05 Watchlist | Yes | Watchlist | Preview watchlist module |
| 06 Signal Intelligence Feed | Yes | Opportunities | Signal pulse hero |
| 07 Market Intelligence Engine (flows) | Yes | Money Flow | Bubble map + industry panels |
| 07 Global Market Intelligence (telemetry globe) | **No** | — | **Not exposed** on wheel |
| S1 High-Signal Alerts | Yes | What Matters | Alert stack hero |
| Macro Event Tracker (7 days) | **No** | — | **Not exposed** on wheel |
| 08 Session Summary | Yes | Summary | Briefing story + education blocks |
| 09 Correlation Engine · 30D | Replaced | Moves Together | Ring instead of matrix |
| 10 News Intelligence | Yes | News | Globe + narrative cards |

---

## 5. Direct answers (requested checks)

| Feature | Still in codebase? | On Intelligence Wheel preview? | Where |
|---------|-------------------|-------------------------------|--------|
| **Historical Pattern Comparisons** | **Yes** | **No** | `index.html` `#page-why` → `#wimHistory` / `drawHistory()` |
| **Market Positioning** | **Yes** | **No** | `index.html` `#page-why` → `.pos` / `.pos-card` (static bars) |
| **Market Reaction Map** | **Yes** | **Partial analogue** | **Legacy:** `#contagionSvg` / `drawContagion()`. **Wheel:** **Moves Together** ring (`dashboard-moves-network.js`) — related idea, different scope and UX. |
| **Movement Decomposition** | **Yes** | **No** | `index.html` `#page-why` → `#wimReasons` / `wimDB[].reasons` |

---

## 6. Legacy modules no longer exposed on the wheel

These remain in `index.html` (or other pages) but **do not appear** as Intelligence Wheel channels in `WHEEL_SECTIONS` / `RENDERERS`:

1. **Why Is It Moving** full page (`#page-why`) — including all four WIM submodules above.  
2. **Movement Decomposition** (weighted reason list).  
3. **Historical Pattern Comparisons**.  
4. **Market Positioning** (institutional / retail / short / IV / skew bars).  
5. **Market Reaction Map** as implemented on WIM (ticker-centric SVG contagion).  
6. **Global Market Intelligence** telemetry globe widget.  
7. **Macro Event Tracker** (7-day calendar).  
8. **Correlation Engine** 30D matrix UI (superseded by Moves Together ring on wheel).  
9. **Legacy flow canvas** (`#flowEngineCanvas`) — superseded by Money Flow bubbles on wheel.  
10. **Legacy VIX gauge SVG** on dashboard panel 03 — superseded by Market Mood on wheel.  
11. **Risk Regime** as standalone panel 04 UI (partially absorbed into Market Risk channel).  
12. **Design-lab-only concepts** Orbit / Deck / Rail (`dashboard-design-lab.js`) — alternate layouts, not production wheel.

**Note:** On Vercel **preview** hosts, `lib/dashboard-preview-route.js` can redirect Dashboard nav to `/dashboard-preview`, so users may never see `#page-dashboard` even though it still ships in `index.html`.

---

## 7. One-page migration matrix (old → new)

```
LEGACY (Dashboard #page-dashboard)          INTELLIGENCE WHEEL (preview)
────────────────────────────────────        ─────────────────────────────
01 Top Movers                          →    Movers
02 Sector Heatmap                      →    Sectors
03 Volatility Monitor                  →    Market Risk (Market Mood)
04 Risk Regime                         →    Market Risk (partial merge)
05 Watchlist                           →    Watchlist
06 Signal Intelligence Feed            →    Opportunities
07 Flow Engine                         →    Money Flow
07 Telemetry Globe                     →    (not migrated)
S1 High-Signal Alerts                  →    What Matters
Macro Event Tracker                    →    (not migrated)
08 Session Summary                     →    Summary
09 Correlation Matrix                  →    Moves Together (ring)
10 News Intelligence                   →    News

LEGACY (WIM #page-why)                    INTELLIGENCE WHEEL (preview)
────────────────────────────────────        ─────────────────────────────
Plain-English Summary (WHY)            →    Movers / News / Summary / Market Risk (partial)
Movement Decomposition (DRIVERS)       →    (not migrated)
Market Reaction Map (REACTION)         →    Moves Together (partial)
Historical Pattern Comparisons         →    (not migrated)
Market Positioning (SENTIMENT)         →    (not migrated)
Ticker search + live quote             →    (not migrated)
```

---

## 8. Code references (for reviewers)

| Area | Files |
|------|--------|
| Wheel sections & renderers | `preview/dashboard-rail-mocks.js` (`RAIL_SECTIONS`, `WHEEL_SECTIONS`, `RENDERERS`) |
| Wheel shell | `preview/dashboard-wheel-core.js`, `preview/dashboard-design-wheel.js` |
| Legacy dashboard DOM | `index.html` `#page-dashboard` |
| Legacy WIM DOM + logic | `index.html` `#page-why`, `loadWim()`, `drawContagion()`, `drawHistory()` |
| Preview routing | `lib/dashboard-preview-route.js`, `dashboard-preview.html` |
| Session channel override | `renderMarketBriefingModule()` in `preview/dashboard-preview-briefing.js` |

---

## 9. Summary judgment

- The Intelligence Wheel is primarily a **redesign and re-home** of the **Live Dashboard intelligence panels**, not a full port of the **Why Is It Moving** decomposition stack.  
- **WHY** and **DRIVERS** content is **distributed** across Movers, Sectors, Market Risk, Money Flow, Opportunities, News, and Summary — but **not** as a single ticker-level WIM workflow.  
- **REACTION** has a **successor** on the wheel (**Moves Together**), but the legacy **Market Reaction Map** remains only on WIM.  
- **PATTERNS** and **SENTIMENT** (Historical Pattern Comparisons and Market Positioning) are **unchanged on WIM** and **absent** from the wheel preview.
