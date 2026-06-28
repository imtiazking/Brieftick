# FORGENIQ logo quality investigation

**Date:** 2026-06-27

## Findings

### 1. Was the logo a low-resolution PNG being scaled up?

**Partially — but not the main issue.**

| Metric | Before | After |
|--------|--------|-------|
| Intrinsic size | 1024×512 | **4096×2048** |
| File size | 7,187 bytes | **169,160 bytes** |
| Alpha channel | Soft semi-transparent edges (max α≈124) | **Binary opaque white / transparent** |
| Source pipeline | `remove_checkerboard()` lum quantization | **Black master → binary threshold** |

The deployed asset was only 1024 px wide, but at desktop (207 px rendered @2x DPR ≈ 414 physical px) that is *technically* sufficient on paper. The visible softness came from **degraded edge pixels** during checkerboard removal, not from upscaling a tiny source beyond 1024 px.

### 2. Intrinsic vs rendered size

Measured in browser (`scripts/probe-logo-resolution.mjs`):

| Viewport | Layout box | CSS transform | **Rendered size** | Effective upscale |
|----------|------------|---------------|-------------------|-------------------|
| 1440 desktop | 176×88 | scale(1.175) | **206.8×103.4** | **1.175×** |
| 768 tablet | 152×76 | scale(1.175) | **178.6×89.3** | **1.175×** |
| 390 mobile | 80×40 | scale(2.21) | **176.8×88.4** | **2.21×** |
| 430 mobile | 86×43 | scale(2.21) | **190.1×95.0** | **2.21×** |

At 2× DPR (Retina), desktop needs ~414 physical px width; 4096 px intrinsic now provides **~10× headroom** after downsample.

### 3. Is the browser resizing beyond native quality?

**Yes — via CSS `transform: scale()`**, not via `<img>` width/height alone.

The browser rasterizes the image at the **layout box** (e.g. 80×40 on mobile), then the compositor **upscales** that bitmap by `scale(2.21)` or `scale(1.175)`. This post-raster upscale is a secondary blur source that a higher-res PNG alone cannot fully eliminate.

**Primary blur source:** degraded 7 KB PNG with soft alpha from `remove_checkerboard()`.  
**Secondary blur source:** CSS transform upscale after rasterization.

## SVG attempt

- **Preferred:** trace approved black master to true vector SVG.
- **Blocked:** `vtracer` crashes on this Windows/Python 3.14 environment; `potrace`/`pypotrace` not buildable without native deps.
- **Fallback applied:** 4096×2048 transparent PNG from approved black master (`scripts/export-forgeniq-logo-hires.py`).

## Changes made

1. **`brand/forgeniq-logo.png`** — replaced with 4096×2048 sharp transparent PNG from black master.
2. **`index.html`** — updated intrinsic `width`/`height` to `4096`/`2048` (same 2:1 aspect ratio; **no layout change**).
3. **`scripts/export-forgeniq-brand-assets.py`** — uses binary alpha instead of lum-quantized checkerboard removal.
4. **No CSS changes** — rendered sizes verified identical.

## QA results

- ✅ Asset loads at 4096×2048
- ✅ Rendered sizes unchanged (desktop 206.8×103.4, mobile 176.8×88.4)
- ✅ Landing / About / Pricing parity pass
- ✅ Transparent background, no checkerboard
- ✅ 200% zoom screenshots: `debug/logo-quality-probe/qa/`

## Remaining limitation

CSS `transform: scale(1.175)` / `scale(2.21)` still upscales a raster layer after paint. For perfectly crisp edges at all scales without CSS changes, a production-quality SVG trace (via potrace/vtracer on CI or design tooling) would be the next step.
