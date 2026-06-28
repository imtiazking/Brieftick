"""Export vector FORGENIQ wordmark SVG from approved lockup (wordmark band only).

Output is for preview / stacked layout — does not modify forgeniq-logo.png.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter
import vtracer

ROOT = Path(__file__).resolve().parents[1]
LOCKUP = ROOT / "brand" / "forgeniq-logo.png"
# Preview-scoped until Variation 1 is approved
SVG_OUT = ROOT / "debug" / "logo-variation-preview" / "forgeniq-wordmark.svg"
TRACE_BIN = ROOT / "debug" / "logo-variation-preview" / "_wordmark-trace-bin.png"

# Tight text band @ 4096×2048 (from approved PNG analysis)
TEXT_X, TEXT_Y = 1104, 920
TEXT_W, TEXT_H = 2542, 296
UPSCALE = 4
BOLD_PX = 2  # morphological bold at trace resolution (not runtime duplicate layers)


def dilate_alpha(img: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return img
    size = radius * 2 + 1
    return img.filter(ImageFilter.MaxFilter(size=size))


def main() -> None:
    if not LOCKUP.is_file():
        raise SystemExit(f"Lockup not found: {LOCKUP}")

    lockup = Image.open(LOCKUP).convert("RGBA")
    band = lockup.crop((TEXT_X, TEXT_Y, TEXT_X + TEXT_W, TEXT_Y + TEXT_H))

    w, h = band.size
    hi = band.resize((w * UPSCALE, h * UPSCALE), Image.Resampling.LANCZOS)
    if BOLD_PX > 0:
        alpha = hi.split()[3]
        alpha = dilate_alpha(alpha, BOLD_PX * UPSCALE)
        hi.putalpha(alpha)

    binary = Image.new("RGB", hi.size, (0, 0, 0))
    px = hi.load()
    opx = binary.load()
    for y in range(hi.size[1]):
        for x in range(hi.size[0]):
            if px[x, y][3] > 128:
                opx[x, y] = (255, 255, 255)

    SVG_OUT.parent.mkdir(parents=True, exist_ok=True)
    binary.save(TRACE_BIN)

    vtracer.convert_image_to_svg_py(
        str(TRACE_BIN),
        str(SVG_OUT),
        colormode="binary",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=1,
        color_precision=8,
        corner_threshold=60,
        length_threshold=3.0,
        path_precision=8,
    )

    svg = SVG_OUT.read_text(encoding="utf-8")
    if "viewBox" not in svg:
        vw, vh = hi.size
        svg = svg.replace("<svg ", f'<svg viewBox="0 0 {vw} {vh}" ', 1)
    # Force white fill — colours unchanged from approved lockup
    svg = svg.replace('fill="#000000"', 'fill="#ffffff"')
    svg = svg.replace('fill="black"', 'fill="#ffffff"')
    svg = svg.replace('fill="#000"', 'fill="#ffffff"')
    if 'fill="#ffffff"' not in svg and "<path" in svg:
        svg = svg.replace("<path ", '<path fill="#ffffff" ', 1)
    SVG_OUT.write_text(svg, encoding="utf-8")

    print(f"Wordmark SVG: {SVG_OUT} ({SVG_OUT.stat().st_size} bytes)")
    print(f"Trace source: {TRACE_BIN} ({hi.size[0]}×{hi.size[1]})")


if __name__ == "__main__":
    main()
