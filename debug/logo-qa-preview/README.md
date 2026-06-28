# Logo QA Preview

**Local URL:** http://localhost:49696
**Generated:** 2026-06-27T13:44:27.070Z

## Screenshots

| # | File | Description |
|---|------|-------------|
| 1 | 01-desktop-1440-header.png | Desktop header |
| 2 | 02-desktop-1440-footer.png | Desktop footer |
| 3 | 03-mobile-390-header.png | Mobile header |
| 4 | 04-mobile-390-menu-open.png | Mobile menu open |
| 5 | 05-dashboard-preview-header.png | Dashboard chrome |
| 6 | 06-auth-signin-modal.png | Sign-in modal |

## Logo crops

- `*-logo-crop-100pct.png` — 100% zoom element crop
- `*-logo-crop-200pct.png` — 200% zoom element crop
- `desktop-1440-logo-on-{dark,white,gold}.png` — transparency on backgrounds

## Automated checks

```json
{
  "hiResAsset": true,
  "desktopSizeApprox15pct": true,
  "mobileSizeApprox15pct": true,
  "aspectRatio2to1": true,
  "scaleDesktop": "1.351 (was 1.175)",
  "scaleMobile": "2.542 (was 2.21)",
  "transparentBackground": "Verify logo-on-dark/white/gold crops in debug/logo-qa-preview/"
}
```

**Pass:** YES

> Do NOT deploy until screenshots are approved.
