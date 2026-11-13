"""Draw photo-like sample receipts for `pnpm --filter @eatme/server receipt:check`.

The receipts are invented (test/fixtures/receipt-layouts.json), in the row
layouts of UK supermarkets. Each one is drawn on a wooden table with a small
tilt, uneven light, blur, noise and JPEG compression, and saved with its
expected result:

    python3 apps/server/scripts/receipt-samples.py test-receipts/samples
    pnpm --filter @eatme/server receipt:check test-receipts/samples

Needs Pillow and the DejaVu fonts (the OCR app's own dependencies).
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FIXTURE = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "receipt-layouts.json"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
# (name, tilt in degrees, blur radius, noise, dark end of the light, JPEG quality)
CONDITIONS = [
    ("clear", 0.8, 0.5, 6, 0.85, 85),
    ("poor", -2.5, 1.1, 14, 0.5, 60),
]


def draw_receipt(rows: list[list[str]], size: int = 30) -> Image.Image:
    font = ImageFont.truetype(FONT, size)
    columns = max(34, max(len(left) + len(right) + 2 for left, right in rows))
    step = font.getlength("0")
    pitch = round(size * 1.45)
    margin = round(size * 1.5)
    width = round(columns * step) + 2 * margin
    paper = Image.new("L", (width, pitch * len(rows) + 2 * margin), 246)
    draw = ImageDraw.Draw(paper)
    for index, (left, right) in enumerate(rows):
        y = margin + index * pitch
        draw.text((margin, y), left, font=font, fill=40)
        draw.text((width - margin - font.getlength(right), y), right, font=font, fill=40)
    return paper


def photograph(paper: Image.Image, tilt: float, blur: float, noise: int, dark: float,
               quality: int, rng: random.Random, target: Path) -> None:
    pad = round(paper.width * 0.16)
    table = Image.new("RGB", (paper.width + 2 * pad, paper.height + 2 * pad), (112, 72, 40))
    grain = ImageDraw.Draw(table)
    for y in range(0, table.height, 7):
        shade = rng.randint(-14, 14)
        grain.line([(0, y), (table.width, y + rng.randint(-3, 3))],
                   fill=(112 + shade, 72 + shade, 40 + shade), width=3)
    sheet = paper.convert("RGB").rotate(tilt, expand=True, resample=Image.Resampling.BICUBIC,
                                        fillcolor=(0, 0, 0))
    mask = Image.new("L", paper.size, 255).rotate(tilt, expand=True)
    table.paste(sheet, ((table.width - sheet.width) // 2, (table.height - sheet.height) // 2), mask)
    # Light falls off from the top to the bottom of the photo.
    light = Image.linear_gradient("L").resize(table.size).point(
        lambda v: round(255 * (1 - (1 - dark) * v / 255)))
    table = Image.composite(table, Image.new("RGB", table.size, (0, 0, 0)), light)
    table = table.filter(ImageFilter.GaussianBlur(blur))
    grit = Image.effect_noise(table.size, noise).convert("RGB")
    table = Image.blend(table, grit, 0.12)
    table.save(target, format="JPEG", quality=quality)


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "test-receipts/samples")
    out.mkdir(parents=True, exist_ok=True)
    receipts = json.loads(FIXTURE.read_text(encoding="utf-8"))["receipts"]
    for receipt in receipts:
        paper = draw_receipt(receipt["rows"])
        expected = {
            "merchant": receipt["merchant"],
            "total": round(sum(line["lineTotal"] for line in receipt["lines"]), 2),
            "lines": receipt["lines"],
        }
        for name, tilt, blur, noise, dark, quality in CONDITIONS:
            stem = f"{receipt['id']}-{name}"
            rng = random.Random(stem)
            photograph(paper, tilt, blur, noise, dark, quality, rng, out / f"{stem}.jpg")
            (out / f"{stem}.expected.json").write_text(json.dumps(expected, indent=2) + "\n")
            print(f"wrote {out / stem}.jpg")


if __name__ == "__main__":
    main()
