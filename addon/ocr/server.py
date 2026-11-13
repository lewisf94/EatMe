"""Private local receipt OCR service for EatMe.

The service accepts a receipt image and returns text lines. Images are processed
in memory and discarded after each request. Product parsing and matching remain
in the EatMe server.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import subprocess
import threading
from math import sqrt
from dataclasses import dataclass, field, replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from statistics import median

from PIL import Image, ImageEnhance, ImageFilter, ImageMath, ImageOps

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_PREPARED_PIXELS = 20_000_000
OCR_TIMEOUT_SECONDS = 25
REQUEST_READ_TIMEOUT_SECONDS = 20
OCR_SLOTS = threading.BoundedSemaphore(1)
# A price at the end of a row, maybe followed by a VAT letter or OCR marks
# ("1.25 ||").
PRICE_LIKE = re.compile(
    r"(?:£\s*)?\d{1,3}\s*(?:[.,]|\s)\s*\d{2}\s*[A-Za-z*]?(?:\s+[^A-Za-z0-9\s]{1,3})*\s*$"
)
PRICE_WORD = re.compile(r"[-£€]{0,2}\d{1,3}[.,]\d{2}")
NON_PRODUCT_LIKE = re.compile(
    r"\b(sub-?total|total|balance|change|cash|card|saving[s]?|multibuy|"
    r"offer|voucher|discount|reduced\s*price|receipt|vat)\b",
    re.IGNORECASE,
)


# The tallest word that is kept, as a multiple of the usual word height.
MAX_WORD_HEIGHT = 1.6


@dataclass(frozen=True)
class Word:
    left: int
    top: int
    width: int
    height: int
    text: str
    confidence: float
    # The OCR pass and Tesseract's own block, paragraph and line numbers.
    # Empty when unknown.
    line: tuple[object, ...] = ()
    # Other readings of a price at the same spot, from other OCR passes.
    alternatives: tuple[str, ...] = ()

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def centre(self) -> float:
        return self.top + self.height / 2

    @property
    def middle(self) -> float:
        return self.left + self.width / 2


@dataclass
class TextLine:
    words: list[Word] = field(default_factory=list)

    @property
    def centre(self) -> float:
        # A median baseline does not move far when Tesseract returns one tall
        # symbol spanning two receipt rows.
        return float(median(word.centre for word in self.words))

    @property
    def height(self) -> float:
        return float(median(word.height for word in self.words))

    @property
    def top(self) -> float:
        return self.centre - self.height / 2


def paper_light(image: Image.Image) -> Image.Image:
    """Estimate how brightly the paper is lit, as a small smooth image.

    The maximum filter removes the dark text and keeps the paper. The blur
    smooths the estimate so letters do not leave holes in it.
    """
    small = image.copy()
    small.thumbnail((256, 256), Image.Resampling.BILINEAR)
    light = small.filter(ImageFilter.MaxFilter(5))
    return light.filter(ImageFilter.GaussianBlur(max(2, min(small.size) // 24)))


def flatten_illumination(image: Image.Image) -> Image.Image:
    """Remove uneven light across the receipt.

    A receipt photo is often brighter at one end than the other, even when
    the eye sees no shadow, and one global contrast setting cannot suit both
    ends. Divide each pixel by the local
    paper brightness so the whole page is white again.
    """
    light = paper_light(image).resize(image.size, Image.Resampling.BILINEAR)
    return ImageMath.lambda_eval(
        lambda args: args["convert"](
            args["min"](args["page"] * 255 / (args["light"] + 1), 255), "L"
        ),
        page=image,
        light=light,
    )


def crop_receipt(image: Image.Image, colour: Image.Image | None = None) -> Image.Image:
    """Trim a dark table or worktop using the receipt's bright page area.

    With the colour photo, a coloured surface such as a wooden table is
    trimmed too: receipt paper is close to grey, so it has low saturation.
    """
    sample = paper_light(image)
    pixels = list(sample.get_flattened_data())
    width, height = sample.size
    # Compare with the brightest paper, not a fixed level. Uneven light can make
    # one end of the paper half as bright as the other end; a fixed level then
    # cut those product rows away.
    brightest = sorted(pixels)[int(len(pixels) * 0.99)]
    bright = max(40, brightest * 0.45)
    if colour is not None:
        saturation = colour.convert("HSV").getchannel("S").resize(sample.size, Image.Resampling.BOX)
        pixels = [
            value if grey <= 60 else 0
            for value, grey in zip(pixels, saturation.get_flattened_data())
        ]
    min_column_fill = 0.28
    min_row_fill = 0.28

    columns = [
        x
        for x in range(width)
        if sum(pixels[y * width + x] >= bright for y in range(height)) / height
        >= min_column_fill
    ]
    rows = [
        y
        for y in range(height)
        if sum(pixels[y * width + x] >= bright for x in range(width)) / width >= min_row_fill
    ]
    if not columns or not rows:
        return image

    scale_x = image.width / width
    scale_y = image.height / height
    padding = max(8, round(min(image.size) * 0.02))
    box = (
        max(0, round(min(columns) * scale_x) - padding),
        max(0, round(min(rows) * scale_y) - padding),
        min(image.width, round((max(columns) + 1) * scale_x) + padding),
        min(image.height, round((max(rows) + 1) * scale_y) + padding),
    )
    if box[2] - box[0] < image.width * 0.35 or box[3] - box[1] < image.height * 0.35:
        return image
    return image.crop(box)


def prepared_dimensions(width: int, height: int) -> tuple[int, int]:
    """Upscale useful text, but cap the decoded working image's total memory."""
    desired_scale = max(1.0, 1800 / width)
    pixel_limited_scale = sqrt(MAX_PREPARED_PIXELS / (width * height))
    scale = min(desired_scale, pixel_limited_scale)
    return max(1, round(width * scale)), max(1, round(height * scale))


def prepare_image(image_bytes: bytes) -> bytes:
    """Correct orientation and improve contrast without destroying thin text."""
    with Image.open(io.BytesIO(image_bytes)) as source:
        if source.width * source.height > MAX_IMAGE_PIXELS:
            raise ValueError("receipt image has too many pixels")
        if source.width < 32 or source.height < 32:
            raise ValueError("receipt image dimensions are too small")
        colour = ImageOps.exif_transpose(source).convert("RGB")
        image = crop_receipt(colour.convert("L"), colour)
        image = flatten_illumination(image)
        prepared_size = prepared_dimensions(image.width, image.height)
        if prepared_size != image.size:
            image = image.resize(prepared_size, Image.Resampling.LANCZOS)
        image = ImageOps.autocontrast(image, cutoff=1)
        image = ImageEnhance.Contrast(image).enhance(1.3)
        image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=3))
        # A small clean border helps Tesseract segment text photographed close
        # to an edge without retaining a large dark camera background.
        border = max(12, round(image.width * 0.01))
        image = ImageOps.expand(image, border=border, fill=255)
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        return output.getvalue()


def tesseract_words(
    image_bytes: bytes, psm: int, thresholding_method: int, label: object = None
) -> list[Word]:
    """Return positioned words without writing the receipt to disk."""
    completed = subprocess.run(
        [
            "tesseract",
            "stdin",
            "stdout",
            "--oem",
            "1",
            "--psm",
            str(psm),
            "-l",
            "eng",
            "-c",
            "user_defined_dpi=300",
            "-c",
            "preserve_interword_spaces=1",
            "-c",
            "load_system_dawg=0",
            "-c",
            "load_freq_dawg=0",
            "-c",
            f"thresholding_method={thresholding_method}",
            "tsv",
        ],
        input=image_bytes,
        capture_output=True,
        check=True,
        timeout=OCR_TIMEOUT_SECONDS,
    )
    return parse_tsv(
        completed.stdout.decode("utf-8", errors="replace"),
        (psm, thresholding_method) if label is None else label,
    )


def parse_tsv(tsv: str, label: object = None) -> list[Word]:
    """Read Tesseract's TSV output into positioned words."""
    rows = csv.DictReader(
        io.StringIO(tsv),
        delimiter="\t",
        # Tesseract does not quote its TSV. A word that starts with a quote
        # mark must not swallow the rows after it.
        quoting=csv.QUOTE_NONE,
    )
    words: list[Word] = []
    for row in rows:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            confidence = float(row.get("conf") or -1)
            left = int(row.get("left") or 0)
            top = int(row.get("top") or 0)
            width = int(row.get("width") or 0)
            height = int(row.get("height") or 0)
        except ValueError:
            continue
        if confidence < 0 or width <= 0 or height <= 0:
            continue
        line = (label, row.get("block_num"), row.get("par_num"), row.get("line_num"))
        words.append(Word(left, top, width, height, text, confidence, line))
    return words


def same_physical_line(word: Word, line: TextLine) -> bool:
    """Match columns split into different OCR blocks back onto one row."""
    # A small mark ("x", "*") on a row must still join the row, so the
    # tolerance follows the taller of the word and the row.
    centre_tolerance = max(4.0, max(word.height, line.height) * 0.45)
    if abs(word.centre - line.centre) > centre_tolerance:
        return False

    # Words on separate receipt rows normally occupy the same horizontal
    # columns. Rejecting substantial x overlap prevents them being joined even
    # when glare gives one word an unusually tall bounding box.
    for existing in line.words:
        overlap = max(0, min(word.right, existing.right) - max(word.left, existing.left))
        if overlap >= min(word.width, existing.width) * 0.35:
            return False
    return True


def line_slopes(words: list[Word]) -> list[tuple[float, float]]:
    """Measure the slope of each wide Tesseract line, as (centre y, slope).

    A curved or tilted receipt makes a row rise or fall from left to right, so
    a price at the right edge can sit nearer to the next row than to its name.
    """
    lines: dict[tuple[object, ...], list[Word]] = {}
    for word in words:
        if word.line:
            lines.setdefault(word.line, []).append(word)
    if not words:
        return []
    page_width = max(w.right for w in words) - min(w.left for w in words)
    slopes: list[tuple[float, float]] = []
    for members in lines.values():
        if len(members) < 3:
            continue
        xs = [w.middle for w in members]
        ys = [w.centre for w in members]
        if max(xs) - min(xs) < page_width * 0.3:
            continue
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        spread = sum((x - mean_x) ** 2 for x in xs)
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / spread
        # A word from the row above or below would give a steep slope.
        height = median(w.height for w in members)
        fit = max(abs(y - mean_y - slope * (x - mean_x)) for x, y in zip(xs, ys))
        if abs(slope) < 0.15 and fit < height * 0.5:
            slopes.append((mean_y, slope))
    return slopes


def level_words(words: list[Word]) -> list[Word]:
    """Move each word up or down to undo the slope of the rows near it."""
    slopes = line_slopes(words)
    if not slopes:
        return words
    left = min(w.left for w in words)
    levelled: list[Word] = []
    for word in words:
        # The median of the three nearest measured rows: the paper can curve,
        # but one badly read row must not tilt its neighbours.
        nearest = sorted(slopes, key=lambda item: abs(item[0] - word.centre))[:3]
        slope = median(s for _, s in nearest)
        shift = round(slope * (word.middle - left))
        levelled.append(replace(word, top=word.top - shift))
    return levelled


def group_words(words: list[Word]) -> list[dict[str, object]]:
    """Rebuild rows geometrically so a right-aligned price stays with its item."""
    grouped: list[TextLine] = []
    for word in sorted(level_words(words), key=lambda item: (item.centre, item.left)):
        matches = [line for line in grouped if same_physical_line(word, line)]
        if matches:
            min(matches, key=lambda line: abs(word.centre - line.centre)).words.append(word)
        else:
            grouped.append(TextLine([word]))

    output: list[dict[str, object]] = []
    for line in sorted(grouped, key=lambda item: item.top):
        ordered = sorted(line.words, key=lambda word: word.left)
        text = " ".join(word.text for word in ordered).strip()
        if not text:
            continue
        confidence = sum(word.confidence for word in ordered) / len(ordered) / 100
        row: dict[str, object] = {"text": text, "confidence": round(confidence, 4)}
        if ordered[-1].alternatives:
            row["priceAlternatives"] = list(ordered[-1].alternatives)
        output.append(row)
    return output


def fuse_words(passes: list[list[Word]], min_confidence: float = 60) -> list[Word]:
    """Keep the most confident reading of each spot across all OCR passes.

    One pass can join two receipt rows into one tall, unreadable word (for
    example an item code with the "2 x" row under it) where another pass reads
    both rows cleanly. Words are taken in order of support (the total
    confidence of all passes that read the same text at that spot, so passes
    that agree win over one confident pass), and a word is dropped when it
    covers much of a word that is already kept. A longer
    reading that contains a kept word ("1.19" over "19") replaces it.
    """

    def overlaps(a: Word, b: Word) -> bool:
        shared = max(0, min(a.right, b.right) - max(a.left, b.left)) * max(
            0, min(a.bottom, b.bottom) - max(a.top, b.top)
        )
        # The same word read twice at a small offset is one word.
        if a.text == b.text and shared > 0:
            return True
        return shared > 0.3 * min(a.width * a.height, b.width * b.height)

    everything = [w for p in passes for w in p]
    words = [w for w in everything if w.confidence >= min_confidence]
    if not words:
        return []
    # A word much taller than the printed text is a background logo or two
    # rows read as one. A word in small letters with a tall letter and a tail
    # ("Sourdough") is about 1.3 times the usual height and must stay.
    usual = median(word.height for word in words)
    words = [word for word in words if word.height <= usual * MAX_WORD_HEIGHT]
    # Passes that agree on a reading make it stronger: the support of a word
    # is the total confidence of every pass that read the same text there.
    def same_spot(a: Word, b: Word) -> bool:
        shared = max(0, min(a.right, b.right) - max(a.left, b.left)) * max(
            0, min(a.bottom, b.bottom) - max(a.top, b.top)
        )
        return shared > 0.5 * min(a.width * a.height, b.width * b.height)

    support = {
        id(w): sum(o.confidence for o in everything if o.text == w.text and same_spot(w, o))
        for w in words
    }
    kept: list[Word] = []
    for word in sorted(words, key=lambda w: (-support[id(w)], -w.confidence)):
        clashes = [k for k in kept if overlaps(word, k)]
        if not clashes:
            kept.append(word)
        elif all(
            k.text in word.text and len(word.text) > len(k.text) and word.height < k.height * 1.5
            for k in clashes
        ):
            kept = [k for k in kept if k not in clashes] + [word]
    # Keep the other price readings at the same spot. The server can use one
    # when the receipt total shows that the kept reading is wrong.
    with_alternatives: list[Word] = []
    for word in kept:
        if PRICE_WORD.fullmatch(word.text):
            others = sorted({
                o.text
                for o in everything
                if o.text != word.text and PRICE_WORD.fullmatch(o.text) and same_spot(word, o)
            })
            word = replace(word, alternatives=tuple(others))
        with_alternatives.append(word)
    return with_alternatives


def candidate_row_counts(lines: list[dict[str, object]]) -> tuple[int, int]:
    """Count complete product rows separately from isolated price fragments."""
    complete = 0
    isolated_prices = 0
    for line in lines:
        text = str(line["text"])
        price = PRICE_LIKE.search(text)
        if not price:
            continue
        name = text[: price.start()]
        has_name = len(re.sub(r"[^A-Za-z]", "", name)) >= 2
        if has_name and not NON_PRODUCT_LIKE.search(name):
            complete += 1
        elif not has_name:
            isolated_prices += 1
    return complete, isolated_prices


def candidate_score(lines: list[dict[str, object]]) -> float:
    """Prefer usable name-and-price rows, not a pass full of price fragments."""
    complete, isolated_prices = candidate_row_counts(lines)
    readable = sum(1 for line in lines if len(re.sub(r"[^A-Za-z]", "", str(line["text"]))) >= 2)
    confidence = sum(float(line["confidence"]) for line in lines)
    return complete * 20 - isolated_prices * 4 + readable * 0.25 + confidence * 0.1


# Printed text is near black after the contrast steps. Ink from the back of
# thin receipt paper, a watermark or a pen mark is grey and falls above this.
# The darker level also removes a grey mark that touches the letters.
DARK_INK_LEVEL = 110
DARKEST_INK_LEVEL = 50


def dark_ink_only(prepared: bytes, level: int = DARK_INK_LEVEL, thicken: bool = False) -> bytes:
    """Keep only near-black pixels, so text that shows through the paper goes.

    At the darkest level thin dot-matrix strokes break up, so they can be
    made one pixel thicker on each side.
    """
    with Image.open(io.BytesIO(prepared)) as image:
        binary = image.convert("L").point(lambda v: 0 if v < level else 255)
        if thicken:
            binary = binary.filter(ImageFilter.MinFilter(3))
        output = io.BytesIO()
        binary.save(output, format="PNG", optimize=True)
        return output.getvalue()


def extract_lines(image_bytes: bytes) -> tuple[list[dict[str, object]], dict[str, int]]:
    """Try receipt-friendly layouts and keep the stronger complete reading."""
    prepared = prepare_image(image_bytes)
    # PSM 11 independently finds sparse text and often recovers faint product
    # rows missed by the column- and block-oriented modes.
    # Thresholds 9 and 8 in the diagnostics mark passes on the dark-ink-only
    # images.
    images = {9: dark_ink_only(prepared), 8: dark_ink_only(prepared, DARKEST_INK_LEVEL, thicken=True)}
    strategies = ((4, 0), (4, 2), (6, 0), (11, 0), (4, 9), (6, 9), (4, 8))
    passes = [
        tesseract_words(
            images.get(threshold, prepared),
            psm,
            0 if threshold in images else threshold,
            (psm, threshold),
        )
        for psm, threshold in strategies
    ]
    candidates = [
        (psm, threshold, group_words(words))
        for (psm, threshold), words in zip(strategies, passes)
    ]
    # A fused reading (psm and threshold 0 in the diagnostics) combines the
    # best words of every pass.
    candidates.append((0, 0, group_words(fuse_words(passes))))
    psm, threshold, lines = max(candidates, key=lambda candidate: candidate_score(candidate[2]))
    # The fused reading has the clearest names. Use it unless it finds fewer
    # price rows than the best single pass finds product rows. A "2 x 1.99"
    # row has no name but is still a price row.
    if sum(candidate_row_counts(candidates[-1][2])) >= candidate_row_counts(lines)[0]:
        psm, threshold, lines = candidates[-1]
    complete, isolated_prices = candidate_row_counts(lines)
    mean_confidence = (
        sum(float(line["confidence"]) for line in lines) / len(lines) if lines else 0
    )
    print(
        f"[eatme-ocr] recognised {len(lines)} lines with psm {psm}/threshold {threshold} "
        f"({complete} complete product rows, {isolated_prices} isolated prices, "
        f"mean confidence {mean_confidence:.0%})",
        flush=True,
    )
    return lines, {
        "pageSegmentationMode": psm,
        "thresholdingMethod": threshold,
        "completeProductRows": complete,
        "isolatedPriceRows": isolated_prices,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "EatMeOCR/0.1"

    def send_json(self, status: int, value: object) -> None:
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True, "engine": "tesseract"})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/ocr":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            self.send_json(400, {"error": "invalid content length"})
            return
        if length <= 0:
            self.send_json(400, {"error": "empty image body"})
            return
        if length > MAX_IMAGE_BYTES:
            self.send_json(413, {"error": "receipt image is too large"})
            return

        self.connection.settimeout(REQUEST_READ_TIMEOUT_SECONDS)
        try:
            image = self.rfile.read(length)
        except (TimeoutError, OSError):
            self.send_json(408, {"error": "timed out reading image body"})
            return
        if len(image) != length:
            self.send_json(400, {"error": "incomplete image body"})
            return
        if not OCR_SLOTS.acquire(blocking=False):
            self.send_json(503, {"error": "receipt recognition is busy; retry shortly"})
            return
        try:
            lines, diagnostics = extract_lines(image)
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "receipt recognition timed out"})
            return
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            # Keep exception detail (paths, decoder internals) out of the reply.
            print(f"[eatme-ocr] could not read image: {type(error).__name__}", flush=True)
            self.send_json(400, {"error": "could not read image"})
            return
        finally:
            OCR_SLOTS.release()

        if not lines:
            self.send_json(422, {"error": "no readable text was found"})
            return
        self.send_json(200, {"lines": lines, "diagnostics": diagnostics})

    def log_message(self, format: str, *args: object) -> None:
        # Do not write recognised receipt text or request details to the log.
        return


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"[eatme-ocr] listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
