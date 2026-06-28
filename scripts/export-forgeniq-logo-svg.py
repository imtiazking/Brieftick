"""Trace approved FORGENIQ lockup to SVG + export high-res PNG from black master."""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image
import vtracer

ROOT = Path(__file__).resolve().parents[1]
BLACK_MASTER = Path(
    r"C:\Users\imtia\.cursor\projects\c-Users-imtia-OneDrive-Desktop-Brieftick\assets"
    r"\c__Users_imtia_AppData_Roaming_Cursor_User_workspaceStorage_7dab5a120509bc7beb1609def2cfe860_images"
    r"_forgeniq_logo_black_-525de6a0-fc22-4b13-bdda-872f4d28e9df.png"
)
SVG_OUT = ROOT / "brand" / "forgeniq-logo.svg"
PNG_4X_OUT = ROOT / "brand" / "forgeniq-logo@4x.png"
TRACE_PBM = ROOT / "brand" / "_forgeniq-trace-source.png"


def clean_transparent_from_black(img: Image.Image) -> Image.Image:
    """White lockup on transparent — sharp binary alpha, no lum quantization."""
    rgb = img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) >= 128:
                opx[x, y] = (255, 255, 255, 255)
    return out


def main() -> None:
    if not BLACK_MASTER.is_file():
        raise SystemExit(f"Black master not found: {BLACK_MASTER}")

    master = Image.open(BLACK_MASTER)
    clean = clean_transparent_from_black(master)
    clean.save(TRACE_PBM, format="PNG")
    print(f"Trace source: {TRACE_PBM} ({clean.size[0]}×{clean.size[1]})")

    vtracer.convert_image_to_svg_py(
        str(TRACE_PBM),
        str(SVG_OUT),
        colormode="binary",
        hierarchical="stacked",
        mode="spline",
        filter_speckle=2,
        color_precision=8,
        corner_threshold=60,
        length_threshold=4.0,
        path_precision=8,
    )
    svg = SVG_OUT.read_text(encoding="utf-8")
    if 'viewBox' not in svg:
        svg = svg.replace(
            '<svg ',
            f'<svg viewBox="0 0 {clean.size[0]} {clean.size[1]}" ',
            1,
        )
    SVG_OUT.write_text(svg, encoding="utf-8")
    print(f"Wrote {SVG_OUT} ({SVG_OUT.stat().st_size} bytes)")

    hi = clean.resize((4096, 2048), Image.Resampling.LANCZOS)
    hi.save(PNG_4X_OUT, format="PNG", compress_level=3)
    print(f"Wrote {PNG_4X_OUT} ({hi.size[0]}×{hi.size[1]}, {PNG_4X_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
