"""Generate path-based FORGENIQ wordmark SVG (preview only)."""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "debug" / "logo-variation-preview"
OUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
FONT_PATH = OUT_DIR / "InterTight-wght.ttf"
if not FONT_PATH.is_file():
    FONT_PATH = ROOT / "debug" / "logo-variation-preview" / "InterTight-wght.ttf"
SVG_OUT = OUT_DIR / "forgeniq-wordmark.svg"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/intertight/InterTight%5Bwght%5D.ttf"
FONT_WEIGHT = int(sys.argv[2]) if len(sys.argv) > 2 else 700
TRACKING_EM = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
TEXT = "FORGENIQ"


def load_font() -> TTFont:
    if not FONT_PATH.exists():
        urllib.request.urlretrieve(FONT_URL, FONT_PATH)
    font = TTFont(FONT_PATH)
    if "fvar" in font:
        from fontTools.varLib.instancer import instantiateVariableFont

        return instantiateVariableFont(font, {"wght": FONT_WEIGHT})
    return font


def glyph_transform(cursor: float, ascender: float) -> Transform:
    """Map font Y-up coordinates to SVG Y-down."""
    return Transform(1, 0, 0, -1, cursor, ascender)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font = load_font()
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    ascender = font["hhea"].ascender

    units_per_em = font["head"].unitsPerEm
    tracking_units = TRACKING_EM * units_per_em
    cursor = 0.0
    bounds_pen = BoundsPen(glyph_set)
    path_entries: list[str] = []

    for i, ch in enumerate(TEXT):
        gname = cmap[ord(ch)]
        transform = glyph_transform(cursor, ascender)

        svg_pen = SVGPathPen(glyph_set)
        glyph_set[gname].draw(TransformPen(svg_pen, transform))
        path_entries.append(svg_pen.getCommands())

        glyph_set[gname].draw(TransformPen(bounds_pen, transform))

        advance, _lsb = font["hmtx"][gname]
        cursor += advance + (tracking_units if i < len(TEXT) - 1 else 0.0)

    xmin, ymin, xmax, ymax = bounds_pen.bounds
    width = xmax - xmin
    height = ymax - ymin
    pad = height * 0.04
    norm_x = -xmin + pad
    norm_y = -ymin + pad

    paths = [
        f'<path d="{d}" transform="translate({norm_x:.4f},{norm_y:.4f})"/>'
        for d in path_entries
    ]

    vb_w = width + pad * 2
    vb_h = height + pad * 2
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w:.2f} {vb_h:.2f}" fill="#ffffff">\n  '
        + "\n  ".join(paths)
        + "\n</svg>"
    )
    SVG_OUT.write_text(svg, encoding="utf-8")
    print(
        f"Wrote {SVG_OUT} ({SVG_OUT.stat().st_size} bytes, "
        f"viewBox 0 0 {vb_w:.1f} {vb_h:.1f}, weight {FONT_WEIGHT})"
    )


if __name__ == "__main__":
    main()
