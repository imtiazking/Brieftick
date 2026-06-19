"""Export FORGENIQ brand PNGs from uploaded lockup — background removal + symbol crop only."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand" / "forgeniq-logo.png"

LOCKUP_OUTPUTS = [
    ROOT / "brand" / "forgeniq-logo.png",
    ROOT / "brand" / "forgeniq-logo-transparent.png",
    ROOT / "brand" / "brieftick-logo.png",
    ROOT / "logo-transparent.png",
]
SYMBOL_OUTPUT = ROOT / "brand" / "forgeniq-symbol-white.png"


def is_background(r: int, g: int, b: int) -> bool:
    return abs(r - g) <= 3 and abs(g - b) <= 3 and max(r, g, b) < 252


def remove_checkerboard(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    bg = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not bg[y][x] and is_background(*px[x, y][:3]):
            bg[y][x] = True
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and is_background(*px[nx, ny][:3]):
                bg[ny][nx] = True
                q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if bg[y][x]:
                px[x, y] = (0, 0, 0, 0)
                continue
            lum = max(r, g, b)
            if lum >= 250:
                px[x, y] = (255, 255, 255, 255)
            else:
                alpha = min(255, max(0, int((lum - 200) * 2.55)))
                if alpha < 10:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (255, 255, 255, alpha)
    return rgba


def symbol_gap_column(img: Image.Image) -> int:
    px = img.convert("RGBA").load()
    w, h = img.size
    for x in range(180, min(320, w)):
        whites = sum(1 for y in range(h) if px[x, y][3] > 32)
        if whites < 3:
            return x
    return 259


def extract_symbol(lockup: Image.Image) -> Image.Image:
    gap = symbol_gap_column(lockup)
    px = lockup.load()
    w, h = lockup.size

    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(gap):
            if px[x, y][3] > 8:
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)

    pad = 6
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w - 1, maxx + pad)
    maxy = min(h - 1, maxy + pad)

    crop = lockup.crop((minx, miny, maxx + 1, maxy + 1))
    cw, ch = crop.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cw) // 2
    oy = (side - ch) // 2
    square.paste(crop, (ox, oy), crop)
    return square


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Source logo not found: {SOURCE}")

    lockup = remove_checkerboard(Image.open(SOURCE))
    symbol = extract_symbol(lockup)

    for path in LOCKUP_OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        lockup.save(path, format="PNG", optimize=True)
        print(f"Wrote {path} ({lockup.size[0]}x{lockup.size[1]})")

    SYMBOL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    symbol.save(SYMBOL_OUTPUT, format="PNG", optimize=True)
    print(f"Wrote {SYMBOL_OUTPUT} ({symbol.size[0]}x{symbol.size[1]})")

    px = lockup.load()
    transparent = sum(1 for y in range(lockup.size[1]) for x in range(lockup.size[0]) if px[x, y][3] == 0)
    print(f"Transparent pixels: {transparent}")


if __name__ == "__main__":
    main()
