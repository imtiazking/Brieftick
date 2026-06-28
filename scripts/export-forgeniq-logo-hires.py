"""Export production FORGENIQ lockup from the approved black-background master only."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
# Official production master — black background RGB (attached approved asset).
MASTER = Path(
    r"C:\Users\imtia\.cursor\projects\c-Users-imtia-OneDrive-Desktop-Brieftick\assets"
    r"\c__Users_imtia_AppData_Roaming_Cursor_User_workspaceStorage_7dab5a120509bc7beb1609def2cfe860_images"
    r"_symbol_logo_1-2a395452-b31e-4836-8331-3fe7f16db2e9.png"
)
SOURCE_COPY = ROOT / "brand" / "forgeniq-logo-source.png"
MASTER_COPY = ROOT / "brand" / "forgeniq-logo-master.png"
LOCKUP_OUT = ROOT / "brand" / "forgeniq-logo.png"
LOCKUP_TRANSPARENT = ROOT / "brand" / "forgeniq-logo-transparent.png"
TARGET_WIDTH = 4096


def transparent_from_black_master(img: Image.Image) -> Image.Image:
    """Black → transparent; logo pixels copied exactly — no recolour or sharpen."""
    rgb = img.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r == 0 and g == 0 and b == 0:
                continue
            opx[x, y] = (r, g, b, 255)
    return out


def export_production_png(master: Image.Image) -> Image.Image:
    rgb = master.convert("RGB")
    w, h = rgb.size
    scale = TARGET_WIDTH / w
    target_h = round(h * scale)
    hi_rgb = rgb.resize((TARGET_WIDTH, target_h), Image.Resampling.LANCZOS)
    hi = transparent_from_black_master(hi_rgb)
    hi.save(LOCKUP_OUT, format="PNG", compress_level=3)
    return hi


def main() -> None:
    if not MASTER.is_file():
        raise SystemExit(f"Approved master not found: {MASTER}")

    master = Image.open(MASTER)
    shutil.copy2(MASTER, SOURCE_COPY)
    shutil.copy2(MASTER, MASTER_COPY)
    clean = transparent_from_black_master(master)
    clean.save(LOCKUP_TRANSPARENT, format="PNG", compress_level=3)
    hi = export_production_png(master)

    px = clean.load()
    semi = sum(1 for y in range(clean.size[1]) for x in range(clean.size[0]) if 0 < px[x, y][3] < 255)
    opaque = sum(1 for y in range(clean.size[1]) for x in range(clean.size[0]) if px[x, y][3] == 255)
    print(f"Master: {MASTER.name} ({Image.open(MASTER).size[0]}×{Image.open(MASTER).size[1]})")
    print(f"Source copy: {SOURCE_COPY}")
    print(f"Master archive: {MASTER_COPY}")
    print(f"Transparent @1x: {LOCKUP_TRANSPARENT} ({clean.size[0]}×{clean.size[1]}, opaque={opaque}, semi={semi})")
    print(f"Production: {LOCKUP_OUT} ({hi.size[0]}×{hi.size[1]}, {LOCKUP_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
