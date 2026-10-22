"""Generate the home-screen icons into ../icons. Requires Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SIZE = 1024


def draw_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE))
    d = ImageDraw.Draw(img)
    top, bottom = (79, 184, 255), (223, 244, 255)
    for y in range(SIZE):
        t = y / SIZE
        d.line([(0, y), (SIZE, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))

    # Checkered platform in perspective
    tile = (142, 224, 106), (98, 196, 86)
    y0, y1 = 640, 1024
    rows = 6
    for r in range(rows):
        ya = y0 + (y1 - y0) * (r / rows) ** 1.4
        yb = y0 + (y1 - y0) * ((r + 1) / rows) ** 1.4
        wa = 260 + 900 * (ya - y0) / (y1 - y0)
        wb = 260 + 900 * (yb - y0) / (y1 - y0)
        cols = 6
        for c in range(cols):
            xa0 = SIZE / 2 - wa / 2 + wa * c / cols
            xa1 = SIZE / 2 - wa / 2 + wa * (c + 1) / cols
            xb0 = SIZE / 2 - wb / 2 + wb * c / cols
            xb1 = SIZE / 2 - wb / 2 + wb * (c + 1) / cols
            d.polygon([(xa0, ya), (xa1, ya), (xb1, yb), (xb0, yb)], fill=tile[(r + c) % 2])

    # Shadow, ball and highlight
    d.ellipse([352, 700, 672, 780], fill=(60, 120, 60))
    cx, cy, r = 512, 500, 230
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 95, 162))
    d.chord([cx - r, cy - r, cx + r, cy + r], 200, 340, fill=(255, 225, 77))
    d.ellipse([cx - 120, cy - 170, cx - 30, cy - 90], fill=(255, 255, 255))
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    big = draw_icon()
    for s in (180, 192, 512):
        big.resize((s, s), Image.LANCZOS).save(OUT / f"icon-{s}.png")
    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
