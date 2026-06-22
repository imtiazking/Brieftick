"""Remove black background from approved FORGENIQ logo — no geometry changes."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    r"C:\Users\imtia\.cursor\projects\c-Users-imtia-OneDrive-Desktop-Brieftick\assets"
    r"\c__Users_imtia_AppData_Roaming_Cursor_User_workspaceStorage_7dab5a120509bc7beb1609def2cfe860_images"
    r"_forgeniq_logo_black_-525de6a0-fc22-4b13-bdda-872f4d28e9df.png"
)
OUTPUTS = [
    ROOT / "brand" / "forgeniq-logo-transparent.png",
    ROOT / "logo-transparent.png",
]


def black_to_transparent(img: Image.Image, threshold: int = 8) -> Image.Image:
    """Un-premultiply white-on-black edges for clean anti-aliasing."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            lum = max(r, g, b)
            if lum <= threshold:
                px[x, y] = (0, 0, 0, 0)
                continue
            alpha = lum
            rr = min(255, (r * 255 + alpha // 2) // alpha)
            gg = min(255, (g * 255 + alpha // 2) // alpha)
            bb = min(255, (b * 255 + alpha // 2) // alpha)
            px[x, y] = (rr, gg, bb, alpha)
    return rgba


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Source logo not found: {SOURCE}")

    img = Image.open(SOURCE)
    out = black_to_transparent(img)

    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        out.save(path, format="PNG", optimize=True)
        print(f"Wrote {path} ({out.size[0]}x{out.size[1]})")


if __name__ == "__main__":
    main()
