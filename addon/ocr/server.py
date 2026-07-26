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
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
OCR_TIMEOUT_SECONDS = 50
PRICE_LIKE = re.compile(r"(?:£\s*)?\d{1,3}\s*(?:[.,]|\s)\s*\d{2}\s*[A-Za-z*]?\s*$")


@dataclass(frozen=True)
class Word:
    left: int
    top: int
    width: int
    height: int
    text: str
    confidence: float

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def centre(self) -> float:
        return self.top + self.height / 2


@dataclass
class TextLine:
    words: list[Word] = field(default_factory=list)

    @property
    def top(self) -> int:
        return min(word.top for word in self.words)

    @property
    def bottom(self) -> int:
        return max(word.bottom for word in self.words)

    @property
    def centre(self) -> float:
        return (self.top + self.bottom) / 2


def crop_receipt(image: Image.Image) -> Image.Image:
    """Trim a dark table or worktop using the receipt's bright page area."""
    sample = image.copy()
    sample.thumbnail((320, 320), Image.Resampling.BILINEAR)
    pixels = list(sample.getdata())
    width, height = sample.size
    bright = 170
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


def prepare_image(image_bytes: bytes) -> bytes:
    """Correct orientation and improve contrast without destroying thin text."""
    with Image.open(io.BytesIO(image_bytes)) as source:
        if source.width * source.height > MAX_IMAGE_PIXELS:
            raise ValueError("receipt image has too many pixels")
        image = ImageOps.exif_transpose(source).convert("L")
        image = crop_receipt(image)
        if image.width < 1800:
            scale = 1800 / image.width
            image = image.resize(
                (1800, max(1, round(image.height * scale))),
                Image.Resampling.LANCZOS,
            )
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


def tesseract_words(image_bytes: bytes, psm: int, thresholding_method: int) -> list[Word]:
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
    rows = csv.DictReader(
        io.StringIO(completed.stdout.decode("utf-8", errors="replace")),
        delimiter="\t",
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
        words.append(Word(left, top, width, height, text, confidence))
    return words


def same_physical_line(word: Word, line: TextLine) -> bool:
    """Match columns split into different OCR blocks back onto one row."""
    overlap = max(0, min(word.bottom, line.bottom) - max(word.top, line.top))
    shorter = min(word.height, line.bottom - line.top)
    centres_close = abs(word.centre - line.centre) <= max(4, shorter * 0.45)
    return overlap >= max(2, shorter * 0.35) or centres_close


def group_words(words: list[Word]) -> list[dict[str, object]]:
    """Rebuild rows geometrically so a right-aligned price stays with its item."""
    grouped: list[TextLine] = []
    for word in sorted(words, key=lambda item: (item.centre, item.left)):
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
        output.append({"text": text, "confidence": round(confidence, 4)})
    return output


def candidate_score(lines: list[dict[str, object]]) -> float:
    """Prefer passes that retain confident, priced receipt rows."""
    priced = sum(1 for line in lines if PRICE_LIKE.search(str(line["text"])))
    readable = sum(1 for line in lines if len(re.sub(r"[^A-Za-z]", "", str(line["text"]))) >= 2)
    confidence = sum(float(line["confidence"]) for line in lines)
    return priced * 10 + readable + confidence


def extract_lines(image_bytes: bytes) -> list[dict[str, object]]:
    """Try receipt-friendly layouts and keep the stronger complete reading."""
    prepared = prepare_image(image_bytes)
    strategies = ((4, 0), (4, 2), (6, 0))
    candidates = [
        (psm, threshold, group_words(tesseract_words(prepared, psm, threshold)))
        for psm, threshold in strategies
    ]
    psm, threshold, lines = max(candidates, key=lambda candidate: candidate_score(candidate[2]))
    mean_confidence = (
        sum(float(line["confidence"]) for line in lines) / len(lines) if lines else 0
    )
    print(
        f"[eatme-ocr] recognised {len(lines)} lines with psm {psm}/threshold {threshold} "
        f"(mean confidence {mean_confidence:.0%})",
        flush=True,
    )
    return lines


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

        image = self.rfile.read(length)
        try:
            lines = extract_lines(image)
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "receipt recognition timed out"})
            return
        except (subprocess.CalledProcessError, OSError, ValueError) as error:
            self.send_json(400, {"error": f"could not read image: {error}"})
            return

        if not lines:
            self.send_json(422, {"error": "no readable text was found"})
            return
        self.send_json(200, {"lines": lines})

    def log_message(self, format: str, *args: object) -> None:
        # Do not write recognised receipt text or request details to the log.
        return


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"[eatme-ocr] listening on :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
